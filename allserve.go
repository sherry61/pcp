package main

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

type Service struct {
	Name    string
	Command string
	Args    []string
	Dir     string // 工作目录
	Port    string // 端口号
	Env     map[string]string
	Mute    bool // true: 不转发该服务的 stdout/stderr（用于刷屏的噪音服务）
}

func main() {
	// 服务清单。消费者依据：本仓库前端/后端调用、frontend/vue.config.js 代理，
	// 以及服务间调用（autocert→CA8090/8091、eth-peer→hardhat8545、mint→eth-peer3010、
	// mpc-flask→mpc-server28091）。逐项对应见各项上方注释。
	//
	// 注意：backend 通过 PCC_BASE_URL 依赖 127.0.0.1:8130，但本文件未启动该服务；
	// 若 PCC 由其他方式单独运行可忽略。
	services := []Service{
		// gosdk(8848): 前端 PRE 接口 /pre/*（BuyPermission / TransferFrom / En-Transfer 等）。
		{
			Name:    "gosdk",
			Command: "go",
			Args:    []string{"run", "main.go"},
			Dir:     "/home/super/r/GoSDK/cmd",
			Port:    "8848",
		},
		// backend(3000): 主 Node 后端；前端 main.js 改写为 /node-api 经 vue 代理访问。
		{
			Name:    "backend",
			Command: "node",
			Args:    []string{"/home/super/fqh/backend/main.js"},
			Dir:     "/home/super/fqh/backend",
			Port:    "3000",
			Env: map[string]string{
				"PCC_CLIENT_ID":     "trading-system",
				"PCC_CLIENT_SECRET": "replace-with-trading-system-signing-secret",
				"PCC_BASE_URL":      "http://127.0.0.1:8130",
			},
		},
		// chainmaker-ca(8090): 前端 /api/ca 代理 + autocert 的 /api/ca/gencert。
		{
			Name:    "chainmaker-ca",
			Command: "/home/super/r/chainmaker-ca/src/chainmaker-ca",
			Args:    []string{"-config", "/home/super/r/chainmaker-ca/src/conf/config.yaml"},
			Dir:     "",
			Port:    "8090",
		},
		// chainmaker-ca-org2(8091): autocert 为 org2 签发证书时调用。
		{
			Name:    "chainmaker-ca-org2",
			Command: "/home/super/r/chainmaker-ca2/chainmaker-ca/src/chainmaker-ca",
			Args:    []string{"-config", "/home/super/r/chainmaker-ca2/chainmaker-ca/src/conf/config.yaml"},
			Dir:     "",
			Port:    "8091",
		},
		// HashServer(8080): 前端 /api 代理指向本机 8080，提供 /api/generate-hash（Java sha256）。
		{
			Name:    "HashServer",
			Command: "mvn",
			Args:    []string{"spring-boot:run"},
			Dir:     "/home/super/lzp/Java/sha256",
			Port:    "8080",
		},
		// certaddr(9092): 前端 /cert-to-addr + autocert 调用。
		{
			Name:    "certaddr",
			Command: "go",
			Args:    []string{"run", "cmccert.go"},
			Dir:     "/home/super/r/chainmaker/chainmaker-go/tools/cmc/address",
			Port:    "9092",
		},
		// autocert(9081): 前端 /generate 代理（自动申请证书），内部调 CA 8090/8091。
		{
			Name:    "autocert",
			Command: "go",
			Args:    []string{"run", "autocert.go"},
			Dir:     "/home/super/fqh/autocert",
			Port:    "9081",
		},
		// gosdk2(8849): 本仓库内无任何调用（前端/后端/mint 均未引用），默认停用；
		// 如确有 org2 链操作需求，取消下面注释即可恢复。
		/*
			{
				Name:    "gosdk2",
				Command: "go",
				Args:    []string{"run", "main.go"},
				Dir:     "/home/super/r/GoSDK2/cmd",
				Port:    "8849",
			},
		*/
		// mpc-server(28091): Go MPC 引擎，由 mpc-flask 通过 mpc.base_url 调用。
		{
			Name:    "mpc-server",
			Command: "./mpc_server",
			Args:    []string{},
			Dir:     "/home/super/fqh/mpc_/app/service/mpc",
			Port:    "28091",
		},
		// mpc-flask(28090): Python 任务层，backend/mpc/client.js 调用。
		{
			Name:    "mpc-flask",
			Command: "/home/super/fqh/.venvs/mpc-flask/bin/python",
			Args:    []string{"-m", "flask", "--app", "app.app", "run", "--host", "0.0.0.0", "--port", "28090"},
			Dir:     "/home/super/fqh/mpc_",
			Port:    "28090",
		},
		// mint-gosdk(8009): 前端/后端调用 /pre/Mint、CB-In/Out、BurnToken。
		{
			Name:    "mint-gosdk",
			Command: "go",
			Args:    []string{"run", "main.go"},
			Dir:     "/home/super/lihuihao/otherwork/mint_service/GoSDK/cmd",
			Port:    "8009",
		},
		// hardhat-node(8545): 本地区块链节点，eth-peer 的 PROVIDER_URL。
		// 被 eth-peer 高频轮询，输出刷屏，默认静音（Mute: true，仅不显示，进程照常运行）。
		{
			Name:    "hardhat-node",
			Command: "./node_modules/.bin/hardhat",
			Args:    []string{"node"},
			Dir:     "/home/super/std/ethCrossChain/my-hardhat-project",
			Port:    "8545",
			Mute:    true,
		},
		// eth-peer(3010): 跨链桥服务，mint_service GoSDK 的 peerBaseURL。
		{
			Name:    "eth-peer",
			Command: "node",
			Args:    []string{"server.js"},
			Dir:     "/home/super/std/ethCrossChain/my-hardhat-project",
			Port:    "3010",
		},
	}

	logf("allserve 启动，共 %d 个服务", len(services))

	var wg sync.WaitGroup
	for _, service := range services {
		wg.Add(1)
		go func(s Service) {
			defer wg.Done()
			_ = startService(s) // 启动/失败/退出信息由 startService 内部统一打印
		}(service)
	}

	// 初始检查端口状态，间隔10秒
	time.Sleep(10 * time.Second)
	monitorServicesOnce(services)

	// 定期检查端口状态，后续每分钟检查一次
	go monitorServices(services)

	wg.Wait()
}

// ts 返回统一的时间戳前缀（本地时区，秒级）。
func ts() string {
	return time.Now().Format("15:04:05")
}

// logf 统一输出格式：时间戳 + 内容。所有 stdout/stderr 都经此打印，
// 避免两路无前缀混排。
func logf(format string, args ...interface{}) {
	fmt.Printf("[%s] %s\n", ts(), fmt.Sprintf(format, args...))
}

func startService(service Service) error {
	if err := ensurePortReleased(service); err != nil {
		logf("[失败] %-18s %v", service.Name, err)
		return err
	}

	cmd := exec.Command(service.Command, service.Args...)
	if service.Dir != "" {
		cmd.Dir = service.Dir // 设置工作目录
	}

	// 静音服务（Mute）不接输出：Stdout/Stderr 保持 nil，exec 会接到 /dev/null，
	// 既不会阻塞子进程，也不占用终端。
	if !service.Mute {
		cmdReader, err := cmd.StdoutPipe()
		if err != nil {
			logf("[失败] %-18s 创建输出管道失败: %v", service.Name, err)
			return err
		}
		cmd.Stderr = cmd.Stdout // stderr 并入 stdout，统一走下面的前缀格式

		scanner := bufio.NewScanner(cmdReader)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024) // 抬高超长行上限，避免中途停止读取
		go func() {
			for scanner.Scan() {
				logf("[%s] %s", service.Name, scanner.Text())
			}
			if err := scanner.Err(); err != nil {
				logf("[%s] 读取输出出错: %v", service.Name, err)
			}
		}()
	}

	cmd.Env = mergeEnv(os.Environ(), service.Env)

	if err := cmd.Start(); err != nil {
		logf("[失败] %-18s 启动命令失败: %v", service.Name, err)
		return err
	}

	suffix := ""
	if service.Mute {
		suffix = " (输出已静音)"
	}
	logf("[已启动] %-18s pid=%-7d port=%s%s", service.Name, cmd.Process.Pid, service.Port, suffix)

	if err := cmd.Wait(); err != nil {
		logf("[退出] %-18s %v", service.Name, err)
		return err
	}
	logf("[退出] %-18s 正常停止", service.Name)
	return nil
}

func mergeEnv(base []string, overrides map[string]string) []string {
	if len(overrides) == 0 {
		return base
	}

	merged := make(map[string]string, len(base)+len(overrides))
	order := make([]string, 0, len(base)+len(overrides))

	for _, entry := range base {
		parts := strings.SplitN(entry, "=", 2)
		key := parts[0]
		value := ""
		if len(parts) == 2 {
			value = parts[1]
		}
		if _, exists := merged[key]; !exists {
			order = append(order, key)
		}
		merged[key] = value
	}

	for key, value := range overrides {
		if strings.TrimSpace(key) == "" {
			continue
		}
		if _, exists := merged[key]; !exists {
			order = append(order, key)
		}
		if strings.TrimSpace(merged[key]) == "" {
			merged[key] = value
		}
	}

	result := make([]string, 0, len(order))
	for _, key := range order {
		result = append(result, key+"="+merged[key])
	}

	return result
}

func ensurePortReleased(service Service) error {
	if strings.TrimSpace(service.Port) == "" {
		return nil
	}

	pids, err := findListeningPIDs(service.Port)
	if err != nil {
		return fmt.Errorf("检查端口 %s 占用失败: %w", service.Port, err)
	}

	if len(pids) == 0 {
		return nil
	}

	logf("[清理] %-18s 端口 %s 被进程 %v 占用，先释放", service.Name, service.Port, pids)

	for _, pid := range pids {
		if err := signalPID(pid, syscall.SIGTERM); err != nil {
			logf("向进程 %d 发送 SIGTERM 失败: %v", pid, err)
		}
	}

	if waitForPortDown(service.Port, 5*time.Second) {
		return nil
	}

	refreshedPIDs, err := findListeningPIDs(service.Port)
	if err != nil {
		return fmt.Errorf("二次检查端口 %s 占用失败: %w", service.Port, err)
	}

	for _, pid := range refreshedPIDs {
		logf("端口 %s 仍未释放，向进程 %d 发送 SIGKILL", service.Port, pid)
		if err := signalPID(pid, syscall.SIGKILL); err != nil {
			logf("向进程 %d 发送 SIGKILL 失败: %v", pid, err)
		}
	}

	if !waitForPortDown(service.Port, 5*time.Second) {
		return fmt.Errorf("端口 %s 仍被占用，无法启动服务 %s", service.Port, service.Name)
	}

	return nil
}

func findListeningPIDs(port string) ([]int, error) {
	if _, err := exec.LookPath("lsof"); err == nil {
		return findListeningPIDsWithLsof(port)
	}

	if _, err := exec.LookPath("fuser"); err == nil {
		return findListeningPIDsWithFuser(port)
	}

	return nil, fmt.Errorf("未找到 lsof 或 fuser，无法按端口清理进程")
}

func findListeningPIDsWithLsof(port string) ([]int, error) {
	cmd := exec.Command("lsof", "-nP", "-iTCP:"+port, "-sTCP:LISTEN", "-t")
	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) == 0 {
			return nil, nil
		}
		return nil, err
	}

	return parsePIDList(string(output))
}

func findListeningPIDsWithFuser(port string) ([]int, error) {
	cmd := exec.Command("fuser", "-n", "tcp", port)
	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() == 1 {
			return nil, nil
		}
		return nil, err
	}

	return parsePIDList(string(output))
}

func parsePIDList(raw string) ([]int, error) {
	fields := strings.Fields(strings.TrimSpace(raw))
	pids := make([]int, 0, len(fields))
	seen := make(map[int]struct{})

	for _, field := range fields {
		pid, err := strconv.Atoi(field)
		if err != nil {
			return nil, fmt.Errorf("无法解析 PID %q: %w", field, err)
		}
		if _, exists := seen[pid]; exists {
			continue
		}
		seen[pid] = struct{}{}
		pids = append(pids, pid)
	}

	return pids, nil
}

func signalPID(pid int, signal syscall.Signal) error {
	process, err := os.FindProcess(pid)
	if err != nil {
		return err
	}

	return process.Signal(signal)
}

func waitForPortDown(port string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if checkPort(port) == "异常" {
			return true
		}
		time.Sleep(300 * time.Millisecond)
	}
	return checkPort(port) == "异常"
}

func monitorServices(services []Service) {
	for {
		// 每次循环都休眠一分钟
		time.Sleep(1 * time.Minute)
		monitorServicesOnce(services)
	}
}

// lastStatus 记录上次各服务的健康状态，用于只在状态变化时输出。
var lastStatus = map[string]string{}

func monitorServicesOnce(services []Service) {
	var lines []string
	for _, service := range services {
		status := checkPort(service.Port)
		prev, seen := lastStatus[service.Name]
		lastStatus[service.Name] = status

		switch {
		case !seen:
			// 首次检查：输出一次基线
			lines = append(lines, fmt.Sprintf("%-18s port=%-5s %s", service.Name, service.Port, status))
		case prev != status:
			lines = append(lines, fmt.Sprintf("%-18s port=%-5s %s -> %s", service.Name, service.Port, prev, status))
		}
	}

	if len(lines) == 0 {
		return // 全部无变化：不打扰
	}

	logf("--- 健康检查 ---")
	for _, line := range lines {
		fmt.Printf("  %s\n", line)
	}
}

func checkPort(port string) string {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("localhost:%s", port), 2*time.Second)
	if err != nil {
		return "异常"
	}
	_ = conn.Close()
	return "正常运行"
}
