package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/fentec-project/gofe/abe"
	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"

	abeService "blockchain_data_auth/crypto/abe"
	"blockchain_data_auth/crypto/itmac"
	"blockchain_data_auth/crypto/zkp"
	"blockchain_data_auth/models"
	"blockchain_data_auth/server/audit"
	"blockchain_data_auth/server/blockchain"
	"blockchain_data_auth/server/handlers"
)

type Server struct {
	chainService         *blockchain.ChainMakerService
	abeService           *abeService.CPABE
	zkpSystem            *zkp.ZKPSystem
	publicKey            *abe.FAMEPubKey
	masterKey            *abe.FAMESecKey
	userKeys             map[string]*abe.FAMEAttribKeys
	authHandler          *handlers.AuthorizationHandler
	bankHandler          *handlers.BankHandler
	datacenterHandler    *handlers.DataCenterHandler
	secretSharingHandler *handlers.SecretSharingHandler
}

func main() {
	// 加载配置
	if err := loadConfig(); err != nil {
		log.Printf("加载配置失败，使用默认配置: %v", err)
	}

	// 初始化区块链服务
	chainService, err := blockchain.NewChainMakerService()
	if err != nil {
		log.Fatalf("初始化区块链服务失败: %v", err)
	}
	defer chainService.Close()

	// 初始化CP-ABE
	abeService, err := abeService.NewCPABE()
	if err != nil {
		log.Fatalf("初始化ABE服务失败: %v", err)
	}

	publicKey, masterKey, err := abeService.Setup()
	if err != nil {
		log.Fatalf("初始化ABE密钥失败: %v", err)
	}

	// 初始化ZKP系统
	var zkpSystem *zkp.ZKPSystem
	log.Printf("开始初始化ZKP系统...")

	zkpSystem, err = zkp.NewZKPSystem()
	if err != nil {
		log.Fatalf("初始化ZKP系统失败: %v", err)
	}
	log.Printf("ZKP系统初始化成功")

	// 获取ChainClient用于handlers
	chainClient := chainService.GetChainClient()

	// 创建handlers
	authHandler := handlers.NewAuthorizationHandler(chainClient)
	authHandler.SetCryptoSystems(abeService, zkpSystem, masterKey, publicKey)

	bankHandler := handlers.NewBankHandler(chainClient)
	// 为银行生成属性密钥 - 修复：添加测试用户ID以便解密授权
	bankAttributes := []string{
		"bank_id:BANK001",
		"role:bank",
		"info_tag:credit",
		"info_tag:income",
		"user_id:test_user_002", // 添加测试用户ID以便能够解密该用户的授权
	}
	bankAttribKeys, err := abeService.GenerateAttribKeys(bankAttributes, masterKey)
	if err != nil {
		log.Printf("为银行生成属性密钥失败: %v", err)
	} else {
		bankHandler.SetCryptoSystems(abeService, zkpSystem, bankAttribKeys, publicKey)
	}

	datacenterHandler := handlers.NewDataCenterHandler(chainClient)
	datacenterHandler.SetZKPSystem(zkpSystem)

	secretSharingHandler := handlers.NewSecretSharingHandler(chainClient)

	// 新增：创建审计处理器
	auditHandler := handlers.NewAuditHandler(chainClient)
	auditHandler.SetCryptoSystems(abeService, zkpSystem)

	// 初始化IT-MAC系统（用于混淆电路审计）。GC 是前端任务流的正式能力，默认启用；
	// 只有显式设置 ENABLE_ITMAC_AUDIT=false/0/off/no 时才关闭。
	var itmacSystem *itmac.ITMACSystem
	if envBoolDefault("ENABLE_ITMAC_AUDIT", true) {
		itmacSystem, err = itmac.NewITMACSystem(128) // 使用128位安全参数
		if err != nil {
			log.Printf("初始化IT-MAC系统失败: %v", err)
			itmacSystem = nil
		} else {
			log.Printf("IT-MAC系统初始化成功")
		}
	}

	// 【新增】初始化审计客户端
	var auditClient *audit.AuditClient
	if viper.GetBool("audit.enabled") {
		auditBaseURL := viper.GetString("audit.base_url")
		if auditBaseURL == "" {
			auditBaseURL = "http://10.112.47.214:8080"
		}
		auditClient = audit.NewAuditClient(auditBaseURL)
		log.Printf("✅ 审计客户端已初始化并启用: %s", auditBaseURL)
	} else {
		log.Printf("审计功能未启用")
	}
	vflHandler := handlers.NewVFLHandler(chainClient, auditClient)

	// 创建服务器实例
	server := &Server{
		chainService:         chainService,
		abeService:           abeService,
		zkpSystem:            zkpSystem,
		publicKey:            publicKey,
		masterKey:            masterKey,
		userKeys:             make(map[string]*abe.FAMEAttribKeys),
		authHandler:          authHandler,
		bankHandler:          bankHandler,
		datacenterHandler:    datacenterHandler,
		secretSharingHandler: secretSharingHandler,
	}

	// 设置Gin路由
	r := setupRouter(server, auditHandler, vflHandler, itmacSystem, auditClient)

	// 启动服务器
	port := serverPort()
	log.Printf("服务器启动在端口 :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("启动服务器失败: %v", err)
	}
}

func serverPort() string {
	port := strings.TrimPrefix(viper.GetString("server.addr"), ":")
	if port == "" {
		port = strings.TrimPrefix(viper.GetString("server.port"), ":")
	}
	if port == "" {
		return "8091"
	}
	return port
}

func loadConfig() error {
	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		configPath = "./config/config.yaml"
	}

	// 检查配置文件是否存在
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		// 配置文件不存在，使用默认配置
		viper.SetDefault("server.port", "8091")
		viper.SetDefault("server.mode", "debug")
		return nil
	}

	viper.SetConfigFile(configPath)
	viper.SetConfigType("yaml")

	// 设置默认值
	viper.SetDefault("server.port", "8091")
	viper.SetDefault("server.mode", "debug")

	return viper.ReadInConfig()
}

func setupRouter(server *Server, auditHandler *handlers.AuditHandler, vflHandler *handlers.VFLHandler, itmacSystem *itmac.ITMACSystem, auditClient *audit.AuditClient) *gin.Engine {
	// 设置Gin模式
	mode := viper.GetString("server.mode")
	if mode == "release" {
		gin.SetMode(gin.ReleaseMode)
	} else {
		gin.SetMode(gin.DebugMode)
	}

	r := gin.Default()

	// 添加中间件
	r.Use(corsMiddleware())
	r.Use(gin.Logger())
	r.Use(gin.Recovery())

	// API路由
	v1 := r.Group("/api/v1")
	{
		// 健康检查 - 只允许GET方法
		v1.GET("/health", healthCheck)
		v1.POST("/health", methodNotAllowedHandler())
		v1.PUT("/health", methodNotAllowedHandler())
		v1.DELETE("/health", methodNotAllowedHandler())
		v1.PATCH("/health", methodNotAllowedHandler())

		// 添加404处理器
		r.NoRoute(func(c *gin.Context) {
			c.JSON(http.StatusNotFound, models.Response{
				Code:    404,
				Message: "Endpoint not found",
			})
		})

		// 用户相关 - 仅授权管理
		users := v1.Group("/users")
		{
			users.POST("/generate-attribute-keys", server.authHandler.GenerateUserAttributeKeys) // 为数据中心注册用户生成属性密钥
			users.POST("/request-authorization", server.authHandler.RequestAuthorization)        // 用户创建授权书
			users.POST("/generate-zkp", server.authHandler.GenerateZKProof)                      // 生成ZKP证明
			// 移除了用户注册和查询接口 - 这些现在由数据中心处理
		}

		// 银行相关
		bank := v1.Group("/bank")
		{
			bank.POST("/request-data", server.bankHandler.RequestData)
			bank.POST("/forward-authorization", server.bankHandler.ForwardAuthorizationToDataCenter) // 新增：转发授权给数据中心
			bank.POST("/verify-authorization", server.bankHandler.VerifyAuthorization)
			bank.POST("/decrypt-authorization", server.bankHandler.DecryptAuthorization)
			bank.POST("/request-with-auth", server.bankHandler.RequestDataWithAuth)
		}

		// 数据中心相关 - 现在是主要的数据管理入口
		datacenter := v1.Group("/datacenter")
		{
			datacenter.POST("/register-user", server.datacenterHandler.RegisterUser) // 用户注册
			datacenter.GET("/users/:user_id", server.datacenterHandler.GetUserData)  // 用户查看自己的数据
			datacenter.POST("/provide-data", server.datacenterHandler.ProvideData)   // 向银行提供授权数据
			datacenter.POST("/generate-proof", server.datacenterHandler.GenerateDataProof)
			datacenter.GET("/query-data", server.datacenterHandler.QueryData)
		}

		// 混淆电路相关路由。默认注册；只有显式设置 ENABLE_GARBLED_CIRCUIT=false/0/off/no 时关闭。
		var gcHandler *handlers.GCHandler
		if envBoolDefault("ENABLE_GARBLED_CIRCUIT", true) && itmacSystem != nil {
			gcHandler = handlers.NewGCHandler(server.chainService.GetChainClient(), itmacSystem, auditClient)

			// 银行侧混淆电路接口
			bank.POST("/gc/generate-task", gcHandler.GenerateGCTask)
			bank.POST("/gc/generate-asset-threshold-task", gcHandler.GenerateAssetThresholdTask)

			// 数据中心侧混淆电路接口
			datacenter.POST("/gc/evaluate", gcHandler.EvaluateGC)
			datacenter.POST("/gc/evaluate-asset-threshold", gcHandler.EvaluateAssetThreshold)
		}

		// 新增：审计相关路由
		audit := v1.Group("/audit")
		{
			audit.POST("/verify-authorization-match", auditHandler.VerifyAuthorizationMatch) // 智能合约A
			audit.POST("/verify-data-ownership", auditHandler.VerifyDataOwnership)           // 智能合约B
			audit.POST("/validate-complete-flow", auditHandler.ValidateCompleteFlow)         // 完整流程验证
			audit.GET("/logs", auditHandler.GetAuditLog)                                     // 审计日志查询
			audit.POST("/secret-sharing/split", server.secretSharingHandler.SplitSecret)

			// 混淆电路审计路由 - 与gcHandler共享taskEvents
			gcAudit := audit.Group("/gc")
			{
				if itmacSystem != nil && gcHandler != nil {
					// 传入gcHandler的taskEvents实现共享
					gcAuditHandler := handlers.NewGCAuditHandler(server.chainService.GetChainClient(), itmacSystem, auditClient, gcHandler.GetTaskEvents())
					gcAudit.POST("/store-commitment", gcAuditHandler.StoreCircuitCommitment) // 存储电路承诺
					gcAudit.POST("/verify-execution", gcAuditHandler.VerifyCircuitExecution) // 验证电路执行
					gcAudit.GET("/query-log", gcAuditHandler.QueryAuditLog)                  // 查询审计日志
					gcAudit.GET("/query-commitment", gcAuditHandler.QueryCircuitCommitment)  // 查询电路承诺
				}
			}
		}

		vfl := v1.Group("/vfl")
		{
			vfl.POST("/train", vflHandler.Train)
			vfl.POST("/verify", vflHandler.Verify)
			vfl.GET("/audit/query", vflHandler.QueryAudit)
		}
	}

	return r
}

func envBoolDefault(name string, defaultValue bool) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(name)))
	switch value {
	case "":
		return defaultValue
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		log.Printf("环境变量 %s=%q 不是布尔值，使用默认值 %t", name, value, defaultValue)
		return defaultValue
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Writer.Header().Set("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

// methodNotAllowedHandler 处理不允许的HTTP方法
func methodNotAllowedHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusMethodNotAllowed, models.Response{
			Code:    405,
			Message: "Method Not Allowed",
		})
	}
}

func healthCheck(c *gin.Context) {
	c.JSON(200, models.Response{
		Code:    0,
		Message: "healthy",
		Data: map[string]interface{}{
			"status":    "healthy",
			"version":   "1.0.0",
			"timestamp": fmt.Sprintf("%d", os.Getpid()),
			"features": map[string]bool{
				"cp-abe":     true,
				"zkp":        true,
				"blockchain": true,
				"vfl":        true,
			},
		},
	})
}
