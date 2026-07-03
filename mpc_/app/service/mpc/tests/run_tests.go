package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func main() {
	fmt.Println("🚀 开始运行区块链数据认证系统单元测试...")
	
	// 设置工作目录
	workDir := "/home/clay/blockchain_data_auth"
	if err := os.Chdir(workDir); err != nil {
		fmt.Printf("❌ 无法切换到工作目录: %v\n", err)
		os.Exit(1)
	}
	
	fmt.Printf("📁 工作目录: %s\n", workDir)
	
	// 运行所有测试并生成覆盖率报告
	fmt.Println("\n📊 运行测试并生成覆盖率报告...")
	
	// 创建覆盖率输出目录
	coverageDir := "coverage"
	if err := os.MkdirAll(coverageDir, 0755); err != nil {
		fmt.Printf("❌ 创建覆盖率目录失败: %v\n", err)
		os.Exit(1)
	}
	
	// 运行测试命令
	testCmd := exec.Command("go", "test", "-v", "-cover", "-coverprofile=coverage/coverage.out", "./tests/unit/...")
	testCmd.Stdout = os.Stdout
	testCmd.Stderr = os.Stderr
	
	if err := testCmd.Run(); err != nil {
		fmt.Printf("⚠️  测试执行过程中出现问题: %v\n", err)
		// 不要退出，继续生成报告
	}
	
	// 生成HTML覆盖率报告
	fmt.Println("\n📋 生成HTML覆盖率报告...")
	htmlCmd := exec.Command("go", "tool", "cover", "-html=coverage/coverage.out", "-o", "coverage/coverage.html")
	if err := htmlCmd.Run(); err != nil {
		fmt.Printf("⚠️  生成HTML报告失败: %v\n", err)
	} else {
		fmt.Println("✅ HTML覆盖率报告已生成: coverage/coverage.html")
	}
	
	// 生成覆盖率统计
	fmt.Println("\n📈 生成覆盖率统计...")
	funcCmd := exec.Command("go", "tool", "cover", "-func=coverage/coverage.out")
	output, err := funcCmd.Output()
	if err != nil {
		fmt.Printf("⚠️  生成覆盖率统计失败: %v\n", err)
	} else {
		// 解析覆盖率结果
		parseCoverageOutput(string(output))
	}
	
	// 列出测试文件
	fmt.Println("\n📄 测试文件列表:")
	listTestFiles()
	
	fmt.Println("\n🎉 测试运行完成!")
	fmt.Println("📊 查看详细覆盖率报告: open coverage/coverage.html")
}

func parseCoverageOutput(output string) {
	lines := strings.Split(output, "\n")
	fmt.Println("📊 覆盖率详细统计:")
	fmt.Println("=" + strings.Repeat("=", 80))
	
	var totalCoverage string
	var moduleStats []string
	
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		
		if strings.Contains(line, "total:") {
			totalCoverage = line
		} else if strings.Contains(line, ".go:") {
			// 提取模块信息
			parts := strings.Fields(line)
			if len(parts) >= 3 {
				file := parts[0]
				function := parts[1]
				coverage := parts[2]
				
				// 简化文件路径显示
				if strings.Contains(file, "/") {
					pathParts := strings.Split(file, "/")
					if len(pathParts) >= 2 {
						file = pathParts[len(pathParts)-2] + "/" + pathParts[len(pathParts)-1]
					}
				}
				
				moduleStats = append(moduleStats, fmt.Sprintf("  %-40s %-30s %s", file, function, coverage))
			}
		}
	}
	
	// 显示模块统计
	if len(moduleStats) > 0 {
		fmt.Printf("%-40s %-30s %s\n", "文件", "函数", "覆盖率")
		fmt.Println(strings.Repeat("-", 80))
		for _, stat := range moduleStats {
			fmt.Println(stat)
		}
		fmt.Println(strings.Repeat("-", 80))
	}
	
	// 显示总覆盖率
	if totalCoverage != "" {
		fmt.Printf("🎯 %s\n", totalCoverage)
	}
	
	fmt.Println("=" + strings.Repeat("=", 80))
}

func listTestFiles() {
	testRoot := "tests"
	
	err := filepath.Walk(testRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		
		if strings.HasSuffix(path, "_test.go") {
			// 统计测试函数数量
			funcCount := countTestFunctions(path)
			fmt.Printf("  %-50s (%d 个测试函数)\n", path, funcCount)
		}
		
		return nil
	})
	
	if err != nil {
		fmt.Printf("⚠️  遍历测试文件失败: %v\n", err)
	}
}

func countTestFunctions(filePath string) int {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return 0
	}
	
	lines := strings.Split(string(content), "\n")
	count := 0
	
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "func Test") && strings.Contains(line, "(t *testing.T)") {
			count++
		}
	}
	
	return count
}