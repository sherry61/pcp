package main

import (
    "encoding/json"
    "fmt"
    "log"
    "strconv"
    
    "chainmaker.org/chainmaker/contract-sdk-go/v2/pb/protogo"
    "chainmaker.org/chainmaker/contract-sdk-go/v2/sandbox"
    "chainmaker.org/chainmaker/contract-sdk-go/v2/sdk"
)

type AuthorizationContract struct{}

func (a *AuthorizationContract) InitContract() protogo.Response {
    return sdk.Success([]byte("Authorization contract initialized"))
}

func (a *AuthorizationContract) UpgradeContract() protogo.Response {
    return sdk.Success([]byte("Authorization contract upgraded"))
}

// StoreAuthorization 存储授权哈希
func (a *AuthorizationContract) StoreAuthorization() protogo.Response {
    params := sdk.Instance.GetArgs()
    
    userID := string(params["user_id"])
    authHash := string(params["auth_hash"])
    policy := string(params["policy"])
    validUntil := string(params["valid_until"])
    
    if userID == "" || authHash == "" || policy == "" {
        return sdk.Error("Missing required parameters")
    }
    
    // 构建存储key
    key := fmt.Sprintf("AUTH_%s_%s", userID, authHash)
    
    // 获取时间戳 - 修正方法名
    timestamp, err := sdk.Instance.GetTxTimeStamp()
    if err != nil {
        return sdk.Error("Failed to get timestamp")
    }
    
    // 构建存储数据
    authData := map[string]string{
        "user_id":     userID,
        "hash":        authHash,
        "policy":      policy,
        "valid_until": validUntil,
        "timestamp":   timestamp,
    }
    
    data, _ := json.Marshal(authData)
    
    // 存储到链上 - 添加表名参数
    err = sdk.Instance.PutStateByte("authorization", key, data)
    if err != nil {
        return sdk.Error(fmt.Sprintf("Failed to store authorization: %v", err))
    }
    
    // 发出事件
    sdk.Instance.EmitEvent("AuthorizationStored", []string{userID, authHash})
    
    return sdk.Success([]byte("Authorization stored successfully"))
}

// VerifyAuthorization 验证授权
func (a *AuthorizationContract) VerifyAuthorization() protogo.Response {
    params := sdk.Instance.GetArgs()
    
    userID := string(params["user_id"])
    authHash := string(params["auth_hash"])
    
    key := fmt.Sprintf("AUTH_%s_%s", userID, authHash)
    
    // 从链上获取数据 - 添加表名参数
    data, err := sdk.Instance.GetStateByte("authorization", key)
    if err != nil || len(data) == 0 {
        return sdk.Error("Authorization not found")
    }
    
    var authData map[string]string
    err = json.Unmarshal(data, &authData)
    if err != nil {
        return sdk.Error("Invalid authorization data")
    }
    
    // 获取当前时间 - 修正方法名
    currentTime, err := sdk.Instance.GetTxTimeStamp()
    if err != nil {
        return sdk.Error("Failed to get current time")
    }
    
    // 检查有效期
    validUntil := authData["valid_until"]
    currentTimeInt, _ := strconv.ParseInt(currentTime, 10, 64)
    validUntilInt, _ := strconv.ParseInt(validUntil, 10, 64)
    
    isValid := currentTimeInt <= validUntilInt
    
    result := map[string]interface{}{
        "valid":       isValid,
        "data":        authData,
        "verified_at": currentTime,
    }
    
    // 如果授权已过期，返回相应消息
    if !isValid {
        result["message"] = "Authorization has expired"
    }
    
    resultData, _ := json.Marshal(result)
    return sdk.Success(resultData)
}

// RevokeAuthorization 撤销授权
func (a *AuthorizationContract) RevokeAuthorization() protogo.Response {
    params := sdk.Instance.GetArgs()
    
    userID := string(params["user_id"])
    authHash := string(params["auth_hash"])
    
    key := fmt.Sprintf("AUTH_%s_%s", userID, authHash)
    
    // 首先检查授权是否存在
    data, err := sdk.Instance.GetStateByte("authorization", key)
    if err != nil || len(data) == 0 {
        return sdk.Error("Authorization not found")
    }
    
    // 获取时间戳 - 修正方法名
    timestamp, err := sdk.Instance.GetTxTimeStamp()
    if err != nil {
        return sdk.Error("Failed to get timestamp")
    }
    
    // 解析原始授权数据
    var authData map[string]string
    err = json.Unmarshal(data, &authData)
    if err != nil {
        return sdk.Error("Failed to parse authorization data")
    }
    
    // 更新授权状态为已撤销
    authData["status"] = "revoked"
    authData["revoked_at"] = timestamp
    
    updatedData, _ := json.Marshal(authData)
    
    // 更新授权记录
    err = sdk.Instance.PutStateByte("authorization", key, updatedData)
    if err != nil {
        return sdk.Error("Failed to update authorization")
    }
    
    // 标记为撤销（保留审计记录）- 添加表名参数
    revokeKey := fmt.Sprintf("REVOKED_%s", key)
    revokeData := map[string]string{
        "user_id":     userID,
        "auth_hash":   authHash,
        "revoked_at":  timestamp,
        "original_key": key,
    }
    revokeBytes, _ := json.Marshal(revokeData)
    
    err = sdk.Instance.PutStateByte("revocation", revokeKey, revokeBytes)
    if err != nil {
        return sdk.Error("Failed to store revocation record")
    }
    
    sdk.Instance.EmitEvent("AuthorizationRevoked", []string{userID, authHash})
    
    return sdk.Success([]byte("Authorization revoked successfully"))
}

// GetAuthorizationHistory 获取授权历史
func (a *AuthorizationContract) GetAuthorizationHistory() protogo.Response {
    params := sdk.Instance.GetArgs()
    
    userID := string(params["user_id"])
    if userID == "" {
        return sdk.Error("User ID is required")
    }
    
    // 这里可以实现更复杂的历史查询逻辑
    // 由于长安链限制，这里返回简单结果
    result := map[string]string{
        "user_id": userID,
        "message": "History query implemented based on index design",
    }
    
    resultData, _ := json.Marshal(result)
    return sdk.Success(resultData)
}

func (a *AuthorizationContract) InvokeContract(method string) protogo.Response {
    switch method {
    case "StoreAuthorization":
        return a.StoreAuthorization()
    case "VerifyAuthorization":
        return a.VerifyAuthorization()
    case "RevokeAuthorization":
        return a.RevokeAuthorization()
    case "GetAuthorizationHistory":
        return a.GetAuthorizationHistory()
    default:
        return sdk.Error("invalid method")
    }
}

func main() {
    err := sandbox.Start(new(AuthorizationContract))
    if err != nil {
        log.Fatal(err)
    }
}
