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
}

func main() {
	services := []Service{
		{
			Name:    "gosdk",
			Command: "go",
			Args:    []string{"run", "main.go"},
			Dir:     "/home/super/r/GoSDK/cmd",
			Port:    "8848",
		},
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
		{
			Name:    "chainmaker-ca",
			Command: "/home/super/r/chainmaker-ca/src/chainmaker-ca",
			Args:    []string{"-config", "/home/super/r/chainmaker-ca/src/conf/config.yaml"},
			Dir:     "",
			Port:    "8090",
		},
		{
			Name:    "chainmaker-ca-org2", // 新增组织2的CA服务
			Command: "/home/super/r/chainmaker-ca2/chainmaker-ca/src/chainmaker-ca",
			Args:    []string{"-config", "/home/super/r/chainmaker-ca2/chainmaker-ca/src/conf/config.yaml"},
			Dir:     "",
			Port:    "8091",
		},
		{
			Name:    "HashServer",
			Command: "mvn",
			Args:    []string{"spring-boot:run"},
			Dir:     "/home/super/lzp/Java/sha256",
			Port:    "8080",
		},
		{
			Name:    "certaddr",
			Command: "go",
			Args:    []string{"run", "cmccert.go"},
			Dir:     "/home/super/r/chainmaker/chainmaker-go/tools/cmc/address",
			Port:    "9092",
		},
		{
			Name:    "autocert",
			Command: "go",
			Args:    []string{"run", "autocert.go"},
			Dir:     "/home/super/fqh/autocert",
			Port:    "9081",
		},
		{
			Name:    "gosdk2",
			Command: "go",
			Args:    []string{"run", "main.go"},
			Dir:     "/home/super/r/GoSDK2/cmd",
			Port:    "8849",
		},
	}

	var wg sync.WaitGroup

	// 启动服务
	for _, service := range services {
		wg.Add(1)
		go func(s Service) {
			defer wg.Done()
			if err := startService(s); err != nil {
				fmt.Printf("启动服务 %s 时出错: %v\n", s.Name, err)
			}
		}(service)
	}

	// 初始检查端口状态，间隔10秒
	time.Sleep(10 * time.Second)
	monitorServicesOnce(services)

	// 定期检查端口状态，后续每分钟检查一次
	go monitorServices(services)

	wg.Wait()
}

func startService(service Service) error {
	fmt.Printf("正在启动服务: %s\n", service.Name)
	if err := ensurePortReleased(service); err != nil {
		return err
	}

	cmd := exec.Command(service.Command, service.Args...)
	if service.Dir != "" {
		cmd.Dir = service.Dir // 设置工作目录
	}

	cmdReader, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("创建标准输出管道失败: %w", err)
	}

	scanner := bufio.NewScanner(cmdReader)
	go func() {
		for scanner.Scan() {
			fmt.Printf("[%s] %s\n", service.Name, scanner.Text())
		}
		if err := scanner.Err(); err != nil {
			fmt.Printf("[%s] 读取输出时发生错误: %v\n", service.Name, err)
		}
	}()

	cmd.Stderr = os.Stderr
	cmd.Env = mergeEnv(os.Environ(), service.Env)

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动命令失败: %w", err)
	}

	if err := cmd.Wait(); err != nil {
		fmt.Printf("服务 %s 异常退出: %v\n", service.Name, err)
		return err
	}

	fmt.Printf("服务 %s 启动成功\n", service.Name)
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

	fmt.Printf("服务 %s 启动前检测到端口 %s 被进程 %v 占用，准备清理\n", service.Name, service.Port, pids)

	for _, pid := range pids {
		if err := signalPID(pid, syscall.SIGTERM); err != nil {
			fmt.Printf("向进程 %d 发送 SIGTERM 失败: %v\n", pid, err)
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
		fmt.Printf("端口 %s 仍未释放，向进程 %d 发送 SIGKILL\n", service.Port, pid)
		if err := signalPID(pid, syscall.SIGKILL); err != nil {
			fmt.Printf("向进程 %d 发送 SIGKILL 失败: %v\n", pid, err)
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

func monitorServicesOnce(services []Service) {
	fmt.Println("\n--- 服务状态 ---")
	for _, service := range services {
		status := checkPort(service.Port)
		fmt.Printf("服务: %s, 端口: %s, 状态: %s\n", service.Name, service.Port, status)
	}
	fmt.Println("----------------")
}

func checkPort(port string) string {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("localhost:%s", port), 2*time.Second)
	if err != nil {
		return "异常"
	}
	_ = conn.Close()
	return "正常运行"
}
