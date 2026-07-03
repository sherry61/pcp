package models

import (
	"time"
)

// ================== 通用响应结构 ==================

// Response 通用响应结构
type Response struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// ================== 用户相关结构 ==================

// UserRegisterRequest 用户注册请求
type UserRegisterRequest struct {
	UserID       string   `json:"user_id" binding:"required"`
	Attributes   []string `json:"attributes" binding:"required"`
	PublicKey    string   `json:"public_key" binding:"required"`
	Organization string   `json:"organization"`
}

// Authorization 授权信息结构（与ABE代码对应）
type Authorization struct {
	ID              string   `json:"id"`
	UserID          string   `json:"user_id"`
	InfoTags        []string `json:"info_tags"`
	Purpose         string   `json:"purpose"`
	ValidityPeriod  int64    `json:"validity_period"`
	AuthorizedParty string   `json:"authorized_party"`
	CreatedAt       int64    `json:"created_at"`
}

// AuthorizationRequest 用户授权请求
type AuthorizationRequest struct {
	RequestID       string   `json:"request_id" binding:"required"`
	UserID          string   `json:"user_id" binding:"required"`
	DataTags        []string `json:"data_tags" binding:"required"`
	Purpose         string   `json:"purpose" binding:"required"`
	ValidityPeriod  int64    `json:"validity_period" binding:"required"`
	AuthorizedParty string   `json:"authorized_party"`
	ZKPProof        string   `json:"zkp_proof"` // 改为可选，因为用户创建授权时不需要ZKP
}

// AuthorizationResponse 授权响应
type AuthorizationResponse struct {
	RequestID      string `json:"request_id"`
	UserID         string `json:"user_id"`
	AuthCiphertext string `json:"auth_ciphertext"`
	AuthHash       string `json:"auth_hash"`
	TransactionID  string `json:"transaction_id"`
	BlockHeight    uint64 `json:"block_height"`
	Policy         string `json:"policy"`
}

// ================== 银行相关结构 ==================

// BankDataRequest 银行数据请求
type BankDataRequest struct {
	RequestID          string   `json:"request_id" binding:"required"`
	BankID             string   `json:"bank_id" binding:"required"`
	UserID             string   `json:"user_id" binding:"required"`
	RequestedDataTypes []string `json:"requested_data_types" binding:"required"`
	BusinessPurpose    string   `json:"business_purpose" binding:"required"`
	UrgencyLevel       string   `json:"urgency_level"`
	BankAttributes     []string `json:"bank_attributes"`
}

// BankVerifyRequest 银行验证请求
type BankVerifyRequest struct {
	AuthorizationID       string `json:"authorization_id" binding:"required"`
	UserID                string `json:"user_id" binding:"required"`
	BankID                string `json:"bank_id" binding:"required"`
	VerificationChallenge string `json:"verification_challenge"`
	ZKPProof              string `json:"zkp_proof"`
}

// BankRequestDataParams 银行请求数据的参数（适配合约）
type BankRequestDataParams struct {
	AuthCiphertext string   `json:"auth_ciphertext" binding:"required"`
	RequestedTags  []string `json:"requested_tags" binding:"required"`
	AuthHash       string   `json:"auth_hash" binding:"required"`
}

// ================== 数据中心相关结构 ==================

// DataCenterProvideRequest 数据中心提供数据请求
type DataCenterProvideRequest struct {
	RequestID      string   `json:"request_id" binding:"required"`
	UserID         string   `json:"user_id" binding:"required"`
	AuthCiphertext string   `json:"auth_ciphertext" binding:"required"`
	RequestedTags  []string `json:"requested_tags" binding:"required"`
	AuthHash       string   `json:"auth_hash" binding:"required"`
	DatacenterID   string   `json:"datacenter_id"`
	ZKPProof       string   `json:"zkp_proof"`
}

// DataCenterResponse 数据中心响应
type DataCenterResponse struct {
	RequestID     string    `json:"request_id"`
	DatacenterID  string    `json:"datacenter_id"`
	EncryptedData string    `json:"encrypted_data"`
	AccessLog     AccessLog `json:"access_log"`
	TransactionID string    `json:"transaction_id"`
	ZKPVerified   bool      `json:"zkp_verified"`
}

// ================== 区块链相关结构 ==================

// ChainTransaction 链上交易信息
type ChainTransaction struct {
	TxID        string    `json:"tx_id"`
	BlockHeight uint64    `json:"block_height"`
	Timestamp   time.Time `json:"timestamp"`
	Status      string    `json:"status"`
}

// ContractParams 合约调用参数
type ContractParams struct {
	ContractName string            `json:"contract_name"`
	Method       string            `json:"method"`
	Params       map[string][]byte `json:"params"`
}

// ================== 审计和日志结构 ==================

// AccessLog 访问日志
type AccessLog struct {
	LogID         string    `json:"log_id"`
	UserID        string    `json:"user_id"`
	AccessorID    string    `json:"accessor_id"`
	DataTags      []string  `json:"data_tags"`
	Purpose       string    `json:"purpose"`
	Timestamp     time.Time `json:"timestamp"`
	Status        string    `json:"status"`
	TransactionID string    `json:"transaction_id"`
	ZKPVerified   bool      `json:"zkp_verified"`
}

// VerificationRecord 验证记录
type VerificationRecord struct {
	RecordID      string    `json:"record_id"`
	UserID        string    `json:"user_id"`
	VerifierID    string    `json:"verifier_id"`
	VerifyType    string    `json:"verify_type"`
	Result        bool      `json:"result"`
	Timestamp     time.Time `json:"timestamp"`
	TransactionID string    `json:"transaction_id"`
}

// ================== ZKP相关结构 ==================

// ZKProof 零知识证明
type ZKProof struct {
	Proof      string `json:"proof"`      // 改为字符串，避免JSON序列化问题
	DataHash   string `json:"data_hash"`  // 改为字符串，使用base64编码
	UserIDHash string `json:"user_id_hash"` // 改为字符串，使用base64编码
}

// ZKPRequest ZKP生成请求
type ZKPRequest struct {
	Data   string `json:"data"`
	UserID string `json:"user_id"`
	Nonce  string `json:"nonce"`
}

// ZKPVerifyRequest ZKP验证请求
type ZKPVerifyRequest struct {
	Proof      []byte `json:"proof"`
	DataHash   []byte `json:"data_hash"`
	UserIDHash []byte `json:"user_id_hash"`
}
