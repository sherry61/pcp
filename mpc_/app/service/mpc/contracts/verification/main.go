package main

import (
    "encoding/json"
    "fmt"
    "strconv"
    "strings"
    "log"
    
    "chainmaker.org/chainmaker/contract-sdk-go/v2/pb/protogo"
    "chainmaker.org/chainmaker/contract-sdk-go/v2/sdk"
    "chainmaker.org/chainmaker/contract-sdk-go/v2/sandbox"
)

// VerificationContract 验证合约
type VerificationContract struct{}

// InitContract 初始化合约
func (v *VerificationContract) InitContract() protogo.Response {
    return sdk.Success([]byte("Verification contract initialized"))
}

// UpgradeContract 升级合约
func (v *VerificationContract) UpgradeContract() protogo.Response {
    return sdk.Success([]byte("Verification contract upgraded"))
}

// VerifyDataAccess 验证数据访问请求
func (v *VerificationContract) VerifyDataAccess() protogo.Response {
    params := sdk.Instance.GetArgs()
    
    bankID := string(params["bank_id"])
    userID := string(params["user_id"])
    authHash := string(params["auth_hash"])
    requestedTags := string(params["requested_tags"])
    
    // 获取时间戳
    timestamp, err := sdk.Instance.GetTxTimeStamp()
    if err != nil {
        return sdk.Error("Failed to get timestamp")
    }
    
    // 获取交易ID
    txId, err := sdk.Instance.GetTxId()
    if err != nil {
        return sdk.Error("Failed to get tx id")
    }
    
    // 记录访问请求
    accessKey := fmt.Sprintf("ACCESS_%s_%s_%s", bankID, userID, timestamp)
    accessData := map[string]string{
        "bank_id":        bankID,
        "user_id":        userID,
        "auth_hash":      authHash,
        "requested_tags": requestedTags,
        "timestamp":      timestamp,
        "tx_id":          txId,
    }
    
    data, err := json.Marshal(accessData)
    if err != nil {
        return sdk.Error("Failed to marshal data")
    }
    
    // 存储数据
    err = sdk.Instance.PutStateByte("data_verification", accessKey, data)
    if err != nil {
        return sdk.Error("Failed to record access request")
    }
    
    // 更新用户访问索引
    v.updateUserAccessIndex(userID, accessKey, timestamp)
    
    // 发出事件
    topics := []string{bankID, userID, authHash}
    sdk.Instance.EmitEvent("DataAccessRequested", topics)
    
    return sdk.Success([]byte("Access request recorded successfully"))
}

// VerifyZKProof 验证零知识证明
func (v *VerificationContract) VerifyZKProof() protogo.Response {
    params := sdk.Instance.GetArgs()
    
    dataHash := string(params["data_hash"])
    userIDHash := string(params["user_id_hash"])
    proofResult := string(params["proof_result"])
    datacenterID := string(params["datacenter_id"])
    
    // 获取时间戳
    timestamp, err := sdk.Instance.GetTxTimeStamp()
    if err != nil {
        return sdk.Error("Failed to get timestamp")
    }
    
    if proofResult != "valid" {
        return sdk.Error("Invalid zero-knowledge proof")
    }
    
    // 获取交易ID
    txId, err := sdk.Instance.GetTxId()
    if err != nil {
        return sdk.Error("Failed to get tx id")
    }
    
    // 记录验证结果
    verifyKey := fmt.Sprintf("VERIFY_%s_%s_%s", datacenterID, userIDHash, timestamp)
    verifyData := map[string]string{
        "data_hash":     dataHash,
        "user_id_hash":  userIDHash,
        "proof_result":  proofResult,
        "datacenter_id": datacenterID,
        "timestamp":     timestamp,
        "tx_id":         txId,
    }
    
    data, err := json.Marshal(verifyData)
    if err != nil {
        return sdk.Error("Failed to marshal data")
    }
    
    // 存储验证记录
    err = sdk.Instance.PutStateByte("proof_verification", verifyKey, data)
    if err != nil {
        return sdk.Error("Failed to record verification")
    }
    
    // 更新验证索引
    v.updateVerificationIndex(datacenterID, verifyKey, timestamp)
    
    // 发出事件
    topics := []string{datacenterID, userIDHash}
    sdk.Instance.EmitEvent("ZKProofVerified", topics)
    
    return sdk.Success([]byte("Proof verification recorded"))
}

// GetAccessLog 获取访问日志
func (v *VerificationContract) GetAccessLog() protogo.Response {
    params := sdk.Instance.GetArgs()
    
    userID := string(params["user_id"])
    startTime := string(params["start_time"])
    endTime := string(params["end_time"])
    
    // 获取用户的访问日志索引
    userLogIndexKey := fmt.Sprintf("ACCESS_INDEX_%s", userID)
    indexBytes, err := sdk.Instance.GetStateByte("access_index", userLogIndexKey)
    
    if err != nil || len(indexBytes) == 0 {
        return sdk.Success([]byte("[]"))
    }
    
    // 解析索引
    var indexEntries []string
    err = json.Unmarshal(indexBytes, &indexEntries)
    if err != nil {
        return sdk.Error("Failed to unmarshal index")
    }
    
    // 时间范围过滤
    var logs []map[string]interface{}
    startTimeInt, _ := strconv.ParseInt(startTime, 10, 64)
    endTimeInt, _ := strconv.ParseInt(endTime, 10, 64)
    
    for _, entry := range indexEntries {
        // 解析索引项：timestamp|logKey
        parts := strings.Split(entry, "|")
        if len(parts) != 2 {
            continue
        }
        
        timestampInt, _ := strconv.ParseInt(parts[0], 10, 64)
        logKey := parts[1]
        
        // 时间范围过滤
        if timestampInt < startTimeInt || timestampInt > endTimeInt {
            continue
        }
        
        // 获取具体的日志数据
        logBytes, err := sdk.Instance.GetStateByte("data_verification", logKey)
        if err != nil {
            continue
        }
        
        var logData map[string]interface{}
        err = json.Unmarshal(logBytes, &logData)
        if err != nil {
            continue
        }
        
        logs = append(logs, logData)
    }
    
    // 返回结果
    result, err := json.Marshal(logs)
    if err != nil {
        return sdk.Error("Failed to marshal result")
    }
    
    return sdk.Success(result)
}

// GetVerificationRecords 查询验证记录
func (v *VerificationContract) GetVerificationRecords() protogo.Response {
    params := sdk.Instance.GetArgs()
    
    datacenterID := string(params["datacenter_id"])
    limit := 100
    if limitStr := string(params["limit"]); limitStr != "" {
        if l, err := strconv.Atoi(limitStr); err == nil {
            limit = l
        }
    }
    
    indexKey := fmt.Sprintf("VERIFY_INDEX_%s", datacenterID)
    indexBytes, err := sdk.Instance.GetStateByte("verify_index", indexKey)
    
    if err != nil || len(indexBytes) == 0 {
        return sdk.Success([]byte("[]"))
    }
    
    var indexEntries []string
    err = json.Unmarshal(indexBytes, &indexEntries)
    if err != nil {
        return sdk.Error("Failed to unmarshal index")
    }
    
    var records []map[string]interface{}
    count := 0
    
    // 倒序遍历，获取最新记录
    for i := len(indexEntries) - 1; i >= 0 && count < limit; i-- {
        parts := strings.Split(indexEntries[i], "|")
        if len(parts) != 2 {
            continue
        }
        
        verifyKey := parts[1]
        recordBytes, err := sdk.Instance.GetStateByte("proof_verification", verifyKey)
        if err != nil {
            continue
        }
        
        var record map[string]interface{}
        err = json.Unmarshal(recordBytes, &record)
        if err != nil {
            continue
        }
        
        records = append(records, record)
        count++
    }
    
    result, err := json.Marshal(records)
    if err != nil {
        return sdk.Error("Failed to marshal records")
    }
    
    return sdk.Success(result)
}

// updateUserAccessIndex 更新用户访问索引（私有方法）
func (v *VerificationContract) updateUserAccessIndex(userID, accessKey, timestamp string) {
    userLogIndexKey := fmt.Sprintf("ACCESS_INDEX_%s", userID)
    indexBytes, err := sdk.Instance.GetStateByte("access_index", userLogIndexKey)
    
    var indexEntries []string
    if err == nil && len(indexBytes) > 0 {
        json.Unmarshal(indexBytes, &indexEntries)
    }
    
    // 将时间戳转换为整数用于排序
    timestampInt, _ := strconv.ParseInt(timestamp, 10, 64)
    
    // 添加新索引项（格式：timestamp|logKey）
    indexEntry := fmt.Sprintf("%d|%s", timestampInt, accessKey)
    indexEntries = append(indexEntries, indexEntry)
    
    // 限制索引大小
    maxEntries := 10000
    if len(indexEntries) > maxEntries {
        indexEntries = indexEntries[len(indexEntries)-maxEntries:]
    }
    
    updatedIndexBytes, _ := json.Marshal(indexEntries)
    sdk.Instance.PutStateByte("access_index", userLogIndexKey, updatedIndexBytes)
}

// updateVerificationIndex 更新验证索引（私有方法）
func (v *VerificationContract) updateVerificationIndex(datacenterID, verifyKey, timestamp string) {
    indexKey := fmt.Sprintf("VERIFY_INDEX_%s", datacenterID)
    indexBytes, err := sdk.Instance.GetStateByte("verify_index", indexKey)
    
    var indexEntries []string
    if err == nil && len(indexBytes) > 0 {
        json.Unmarshal(indexBytes, &indexEntries)
    }
    
    // 将时间戳转换为整数
    timestampInt, _ := strconv.ParseInt(timestamp, 10, 64)
    
    // 添加新索引项
    indexEntry := fmt.Sprintf("%d|%s", timestampInt, verifyKey)
    indexEntries = append(indexEntries, indexEntry)
    
    // 限制索引大小
    maxEntries := 10000
    if len(indexEntries) > maxEntries {
        indexEntries = indexEntries[len(indexEntries)-maxEntries:]
    }
    
    updatedIndexBytes, _ := json.Marshal(indexEntries)
    sdk.Instance.PutStateByte("verify_index", indexKey, updatedIndexBytes)
}

func (v *VerificationContract) InvokeContract(method string) protogo.Response {
	switch method {

    case "VerifyDataAccess":
        return v.VerifyDataAccess()
    case "VerifyZKProof":
        return v.VerifyZKProof()
    case "GetAccessLog":
        return v.GetAccessLog()
    case "GetVerificationRecords":
        return v.GetVerificationRecords()
    default:
		return sdk.Error("invalid method")
	}
}


// main 合约入口函数
func main() {  
    // main()方法中，下面的代码为必须代码，不建议修改main()方法当中的代码
    // 其中，TestContract为用户实现合约的具体名称
     err := sandbox.Start(new(VerificationContract))
     if err != nil {
         log.Fatal(err)
     }
 }
