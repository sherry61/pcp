package main

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"os/exec"
	"sync"
	"time"
)

type Service struct {
	Name    string
	Command string
	Args    []string
	Dir     string // 工作目录
	Port    string // 端口号
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
			Dir:     "/home/super/r/autocert",
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
	cmd.Env = os.Environ() // 继承环境变量

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
