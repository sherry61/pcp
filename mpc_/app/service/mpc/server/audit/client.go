package audit

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

// AuditClient 审计客户端，用于调用Flask审计服务
type AuditClient struct {
	baseURL     string
	token       string
	httpClient  *http.Client
	enabled     bool
	mu          sync.RWMutex
}

// NewAuditClient 创建审计客户端
func NewAuditClient(baseURL string) *AuditClient {
	if baseURL == "" {
		baseURL = "http://10.112.47.214:8080"
	}

	return &AuditClient{
		baseURL:     baseURL,
		token:       os.Getenv("flask_app_token"),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		enabled: true,
	}
}

// IsEnabled 检查审计客户端是否启用
func (c *AuditClient) IsEnabled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.enabled
}

// SetEnabled 设置审计客户端启用状态
func (c *AuditClient) SetEnabled(enabled bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.enabled = enabled
}

// EventRequest 创建事件请求
type EventRequest struct {
	TypeID         int      `json:"typeId"`
	Name           string   `json:"name"`
	ParticipantsID []int    `json:"participantsId"`
}

// EventResponse 创建事件响应
type EventResponse struct {
	Success bool   `json:"success"`
	ErrCode int    `json:"errcode"`
	Msg     string `json:"msg"`
	EventID int    `json:"eventId"` // Flask返回的是数字类型
}

// LogRequest 添加审计日志请求
type LogRequest struct {
	EventID    int    `json:"eventId"` // Flask期望数字类型
	CurStatus  int    `json:"curStatus"`
	StatusName string `json:"status_name"`
	Content    string `json:"content"`
}

// LogResponse 添加审计日志响应
type LogResponse struct {
	Success bool   `json:"success"`
	ErrCode int    `json:"errcode"`
	Msg     string `json:"msg"`
}

// CreateEvent 创建审计事件
// typeID: 事件类型ID（0=同态加密, 1=混淆电路, 2=代理重加密等）
// name: 事件名称
// participants: 参与者ID列表
func (c *AuditClient) CreateEvent(typeID int, name string, participants []int) (string, error) {
	if !c.IsEnabled() {
		log.Printf("[Audit] 审计客户端未启用，跳过创建事件")
		return "", nil
	}

	reqData := EventRequest{
		TypeID:         typeID,
		Name:           name,
		ParticipantsID: participants,
	}

	bodyBytes, err := json.Marshal(reqData)
	if err != nil {
		return "", fmt.Errorf("序列化请求失败: %v", err)
	}

	req, err := http.NewRequest("POST", c.baseURL+"/event/create", bytes.NewBuffer(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("创建HTTP请求失败: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("token", c.token)

	log.Printf("[Audit] 创建事件请求: typeID=%d, name=%s, participants=%v", typeID, name, participants)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("发送HTTP请求失败: %v", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %v", err)
	}

	var result EventResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		log.Printf("[Audit] 解析响应失败: %v, 原始响应: %s", err, string(respBody))
		return "", fmt.Errorf("解析响应失败: %v", err)
	}

	// Flask返回errcode=0表示成功
	if result.ErrCode != 0 {
		return "", fmt.Errorf("创建事件失败: %s (errcode: %d)", result.Msg, result.ErrCode)
	}

	eventIDStr := fmt.Sprintf("%d", result.EventID)
	log.Printf("[Audit] ✅ 事件创建成功: eventID=%s", eventIDStr)
	return eventIDStr, nil
}

// AddAuditLog 添加审计日志
// eventID: 事件ID（字符串格式的数字）
// curStatus: 当前状态（递增的数字，表示流程进度）
// statusName: 状态名称
// content: 日志内容
func (c *AuditClient) AddAuditLog(eventID string, curStatus int, statusName, content string) error {
	if !c.IsEnabled() {
		log.Printf("[Audit] 审计客户端未启用，跳过添加日志")
		return nil
	}

	if eventID == "" {
		log.Printf("[Audit] 事件ID为空，跳过添加日志")
		return nil
	}

	// 将字符串eventID转换为int
	eventIDInt := 0
	fmt.Sscanf(eventID, "%d", &eventIDInt)

	reqData := LogRequest{
		EventID:    eventIDInt,
		CurStatus:  curStatus,
		StatusName: statusName,
		Content:    content,
	}

	bodyBytes, err := json.Marshal(reqData)
	if err != nil {
		return fmt.Errorf("序列化请求失败: %v", err)
	}

	req, err := http.NewRequest("POST", c.baseURL+"/event/log", bytes.NewBuffer(bodyBytes))
	if err != nil {
		return fmt.Errorf("创建HTTP请求失败: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("token", c.token)

	log.Printf("[Audit] 添加日志: eventID=%s, status=%d, statusName=%s", eventID, curStatus, statusName)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("发送HTTP请求失败: %v", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("读取响应失败: %v", err)
	}

	var result LogResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		log.Printf("[Audit] 解析响应失败: %v, 原始响应: %s", err, string(respBody))
		return fmt.Errorf("解析响应失败: %v", err)
	}

	// Flask返回errcode=0表示成功
	if result.ErrCode != 0 {
		return fmt.Errorf("添加日志失败: %s (errcode: %d)", result.Msg, result.ErrCode)
	}

	log.Printf("[Audit] ✅ 日志添加成功: status=%d", curStatus)
	return nil
}

// HealthCheck 检查审计服务健康状态
func (c *AuditClient) HealthCheck() error {
	if !c.IsEnabled() {
		return nil
	}

	resp, err := c.httpClient.Get(c.baseURL + "/health")
	if err != nil {
		return fmt.Errorf("健康检查失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("审计服务不健康: status=%d", resp.StatusCode)
	}

	log.Printf("[Audit] 审计服务健康检查通过")
	return nil
}
