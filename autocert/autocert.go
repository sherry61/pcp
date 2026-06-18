package main

import (
	"archive/zip"
	"bytes"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// CertRequest 定义了证书生成请求格式
type CertRequest struct {
	OrgId     string `json:"orgId"`
	UserId    string `json:"userId"`
	UserType  string `json:"userType"`
	CertUsage string `json:"certUsage"`
	Country   string `json:"country"`
	Locality  string `json:"locality"`
	Province  string `json:"province"`
}

// CertResponse 定义了证书生成响应格式
type CertResponse struct {
	Code int             `json:"code"`
	Data json.RawMessage `json:"data"`
	Msg  string          `json:"msg"`
}

type CertResponseData struct {
	Cert       string `json:"cert"`
	PrivateKey string `json:"privateKey"`
}

// ClientRequest 包含客户端编号和组织标识
type ClientRequest struct {
	ClientNumber string `json:"client_number"`
	Org          string `json:"org"` // 例如 "wx-org1" 或 "wx-org2"
}

// sktopk 请求结构体
type SktopkDetail struct {
	PrivateKey string `json:"private_key"`
}

type SktopkRequest struct {
	Details []SktopkDetail `json:"details"`
}

// sktopk 响应结构体
type SktopkResponse struct {
	PrivateKey string `json:"private_key"`
	PublicKey  string `json:"public_key"`
}

type RegistryRequest struct {
	UserID          *int64 `json:"userId"`
	CertificateName string `json:"certificateName"`
	Org             string `json:"org"`
	SignCertPath    string `json:"signCertPath"`
	TLSCertPath     string `json:"tlsCertPath"`
	PEMPath         string `json:"pemPath"`
	Address         string `json:"address"`
	ExpiresAt       string `json:"expiresAt"`
}

const backendRegistryURL = "http://127.0.0.1:3000/api/certificate-registry/upsert"
const certStoreBaseDir = "/home/super/fqh/cert-store"

func normalizedOrgDir(org string) string {
	if strings.HasSuffix(org, ".chainmaker.org") {
		return org
	}
	return fmt.Sprintf("%s.chainmaker.org", org)
}

type addrResp struct {
	Address string `json:"address"`
	Ski     string `json:"ski"`
}

type certToAddrResponse struct {
	Ethereum addrResp `json:"ethereum"`
}

// copyDir 复制源文件夹到目标文件夹
func copyDir(src string, dest string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		relPath, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		destPath := filepath.Join(dest, relPath)
		if info.IsDir() {
			return os.MkdirAll(destPath, info.Mode())
		}
		srcFile, err := os.Open(path)
		if err != nil {
			return err
		}
		defer srcFile.Close()
		destFile, err := os.Create(destPath)
		if err != nil {
			return err
		}
		defer destFile.Close()
		_, err = io.Copy(destFile, srcFile)
		return err
	})
}

// createZip 将 clientDir 下的所有文件打包成 ZIP
func createZip(clientNumber string) (string, error) {
	// clientDir 里已经生成了：sign.crt, sign.key, tls.crt, tls.key, clientNumber.pem
	clientDir := fmt.Sprintf("/home/super/r/cert/%s", clientNumber)

	// ZIP 文件路径
	zipFilename := fmt.Sprintf("/home/super/r/cert/%s.zip", clientNumber)
	zipFile, err := os.Create(zipFilename)
	if err != nil {
		return "", fmt.Errorf("failed to create zip file: %v", err)
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	// 遍历 clientDir，把里面的所有文件（不包含子目录）打包
	err = filepath.Walk(clientDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		// rel 是相对于 clientDir 的相对路径，比如 "rtwx204239.sign.crt"
		rel, err := filepath.Rel(clientDir, path)
		if err != nil {
			return err
		}
		fw, err := zipWriter.Create(rel)
		if err != nil {
			return err
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = io.Copy(fw, f)
		return err
	})
	if err != nil {
		return "", fmt.Errorf("failed to zip clientDir: %v", err)
	}

	fmt.Printf("Client %s files have been packaged into %s\n", clientNumber, zipFilename)

	return zipFilename, nil
}

func copyToGoSDK(clientNumber, org string) error {
	clientDir := fmt.Sprintf("/home/super/r/cert/%s", clientNumber)
	targetDir := fmt.Sprintf(
		"/home/super/r/GoSDK/crypto-config/%s.chainmaker.org/user/%s",
		org, clientNumber,
	)
	if err := copyDir(clientDir, targetDir); err != nil {
		return fmt.Errorf("failed to copy folder to target directory: %v", err)
	}
	fmt.Printf("Client %s files have been copied to %s\n", clientNumber, targetDir)
	return nil
}

func buildCertStorePaths(clientNumber, org string) (string, string, string) {
	baseDir := fmt.Sprintf("%s/%s/%s", certStoreBaseDir, normalizedOrgDir(org), clientNumber)
	signCertPath := fmt.Sprintf("%s/%s.sign.crt", baseDir, clientNumber)
	tlsCertPath := fmt.Sprintf("%s/%s.tls.crt", baseDir, clientNumber)
	pemPath := fmt.Sprintf("%s/%s.pem", baseDir, clientNumber)
	return signCertPath, tlsCertPath, pemPath
}

func resolveCertificateAddress(signCertPath string) (string, error) {
	requestBody, err := json.Marshal(map[string]string{
		"cert_path": signCertPath,
	})
	if err != nil {
		return "", err
	}

	resp, err := http.Post("http://127.0.0.1:9092/cert-to-addr", "application/json", bytes.NewBuffer(requestBody))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("cert-to-addr failed: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var parsed certToAddrResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", err
	}
	if parsed.Ethereum.Address == "" {
		return "", fmt.Errorf("empty ethereum address")
	}

	return parsed.Ethereum.Address, nil
}

func resolveCertificateExpiry(signCertPath string) (string, error) {
	certPEM, err := os.ReadFile(signCertPath)
	if err != nil {
		return "", err
	}

	block, _ := pem.Decode(certPEM)
	if block == nil {
		return "", fmt.Errorf("failed to decode cert pem")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return "", err
	}

	return cert.NotAfter.Format("2006-01-02 15:04:05"), nil
}

func registerCertificate(clientNumber, org string) error {
	signCertPath, tlsCertPath, pemPath := buildCertStorePaths(clientNumber, org)
	address, err := resolveCertificateAddress(signCertPath)
	if err != nil {
		return err
	}
	expiresAt, err := resolveCertificateExpiry(signCertPath)
	if err != nil {
		return err
	}

	payload := RegistryRequest{
		UserID:          nil,
		CertificateName: clientNumber,
		Org:             org,
		SignCertPath:    signCertPath,
		TLSCertPath:     tlsCertPath,
		PEMPath:         pemPath,
		Address:         address,
		ExpiresAt:       expiresAt,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	resp, err := http.Post(backendRegistryURL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, _ := ioutil.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("registry request failed: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	return nil
}

func persistCertificateFiles(clientNumber, org string) error {
	sourceDir := fmt.Sprintf("/home/super/r/cert/%s", clientNumber)
	targetDir := fmt.Sprintf("%s/%s/%s", certStoreBaseDir, normalizedOrgDir(org), clientNumber)

	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return err
	}

	entries, err := os.ReadDir(sourceDir)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		srcPath := fmt.Sprintf("%s/%s", sourceDir, entry.Name())
		dstPath := fmt.Sprintf("%s/%s", targetDir, entry.Name())

		data, err := os.ReadFile(srcPath)
		if err != nil {
			return err
		}

		if err := os.WriteFile(dstPath, data, 0644); err != nil {
			return err
		}
	}

	return nil
}

// handleGenerate 处理生成证书请求，根据传入的组织选择不同的 CA 服务端口
func handleGenerate(w http.ResponseWriter, r *http.Request) {
	var clientReq ClientRequest
	if err := json.NewDecoder(r.Body).Decode(&clientReq); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	clientNumber := clientReq.ClientNumber
	org := clientReq.Org

	var caPort string
	if org == "wx-org2" {
		caPort = "8091"
	} else {
		caPort = "8090"
	}

	// 确保 clientDir 已存在
	clientDir := fmt.Sprintf("/home/super/r/cert/%s", clientNumber)
	if err := os.MkdirAll(clientDir, 0755); err != nil {
		http.Error(w, "mkdir clientDir failed", http.StatusInternalServerError)
		return
	}

	var detailedResponses []map[string]interface{}
	var firstPrivateKey string
	hasError := false

	for _, certType := range []string{"sign", "tls"} {
		var rawResponse string
		func() {
			defer func() {
				if rec := recover(); rec != nil {
					detailedResponses = append(detailedResponses, map[string]interface{}{
						"cert_type":  certType,
						"status":     "error",
						"message":    fmt.Sprintf("Unexpected error: %v", rec),
						"raw_output": rawResponse,
					})
				}
			}()

			// 调用 CA 服务生成证书
			url := fmt.Sprintf("http://localhost:%s/api/ca/gencert", caPort)
			reqData := CertRequest{
				OrgId:     fmt.Sprintf("%s.chainmaker.org", org),
				UserId:    fmt.Sprintf("%s.%s", clientNumber, certType),
				UserType:  "client",
				CertUsage: certType,
				Country:   "CN",
				Locality:  "BeiJing",
				Province:  "BeiJing",
			}
			jsonData, err := json.Marshal(reqData)
			if err != nil {
				rawResponse = err.Error()
				panic(err)
			}
			resp, err := http.Post(url, "application/json", bytes.NewBuffer(jsonData))
			if err != nil {
				rawResponse = err.Error()
				panic(err)
			}
			defer resp.Body.Close()

			body, err := ioutil.ReadAll(resp.Body)
			if err != nil {
				rawResponse = err.Error()
				panic(err)
			}
			rawResponse = string(body)

			var response CertResponse
			if err := json.Unmarshal(body, &response); err != nil {
				rawResponse = fmt.Sprintf("unmarshal error: %v\n%s", err, rawResponse)
				panic(err)
			}
			if response.Code != 200 {
				rawResponse = response.Msg
				panic(fmt.Errorf(response.Msg))
			}

			var certData CertResponseData
			if err := json.Unmarshal(response.Data, &certData); err != nil {
				rawResponse = fmt.Sprintf("unmarshal cert data error: %v\n%s", err, rawResponse)
				panic(err)
			}

			// 写入 .crt 和 .key 文件
			crtPath := fmt.Sprintf("/home/super/r/cert/%s/%s.%s.crt", clientNumber, clientNumber, certType)
			keyPath := fmt.Sprintf("/home/super/r/cert/%s/%s.%s.key", clientNumber, clientNumber, certType)
			if err := ioutil.WriteFile(crtPath, []byte(certData.Cert), 0644); err != nil {
				rawResponse = err.Error()
				panic(err)
			}
			if err := ioutil.WriteFile(keyPath, []byte(certData.PrivateKey), 0644); err != nil {
				rawResponse = err.Error()
				panic(err)
			}

			// 记录第一个私钥，用于后面生成单个 pem
			if firstPrivateKey == "" {
				firstPrivateKey = certData.PrivateKey
			}

			detailedResponses = append(detailedResponses, map[string]interface{}{
				"cert_type":   certType,
				"status":      "success",
				"cert":        certData.Cert,
				"private_key": certData.PrivateKey,
				"raw_output":  rawResponse,
			})
		}()
	}

	for _, item := range detailedResponses {
		if item["status"] == "error" {
			hasError = true
			break
		}
	}

	if hasError {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":   "error",
			"message":  "证书生成失败，请检查 details",
			"details":  detailedResponses,
			"zip_path": "",
		})
		return
	}

	// 循环结束后，只生成一个 .pem
	if firstPrivateKey != "" {
		sktopkURL := "http://10.112.47.214:10086/sktopk"
		skReq := SktopkRequest{Details: []SktopkDetail{{PrivateKey: firstPrivateKey}}}
		skBody, _ := json.Marshal(skReq)
		resp2, err := http.Post(sktopkURL, "application/json", bytes.NewBuffer(skBody))
		if err == nil {
			defer resp2.Body.Close()
			body2, _ := ioutil.ReadAll(resp2.Body)
			var skResp SktopkResponse
			if err := json.Unmarshal(body2, &skResp); err == nil {
				pemPath := fmt.Sprintf("/home/super/r/cert/%s/%s.pem", clientNumber, clientNumber)
				_ = ioutil.WriteFile(pemPath, []byte(skResp.PublicKey), 0644)
			}
		}
	}

	// 打包并复制
	if err := persistCertificateFiles(clientReq.ClientNumber, clientReq.Org); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":   "error",
			"message":  fmt.Sprintf("证书持久化失败: %v", err),
			"details":  detailedResponses,
			"zip_path": "",
		})
		return
	}

	zipPath, err := createZip(clientReq.ClientNumber)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":   "error",
			"message":  fmt.Sprintf("Error creating zip package: %v", err),
			"details":  detailedResponses,
			"zip_path": "",
		})
		return
	}

	if err := registerCertificate(clientReq.ClientNumber, clientReq.Org); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":   "error",
			"message":  fmt.Sprintf("证书生成成功，但登记失败: %v", err),
			"details":  detailedResponses,
			"zip_path": zipPath,
		})
		return
	}

	goSDKCopyWarning := ""
	if err := copyToGoSDK(clientReq.ClientNumber, clientReq.Org); err != nil {
		goSDKCopyWarning = err.Error()
	}

	response := map[string]interface{}{
		"status":   "success",
		"message":  "Certificates and public key generated, zipped successfully",
		"zip_path": zipPath,
		"details":  detailedResponses,
	}
	if goSDKCopyWarning != "" {
		response["warning"] = goSDKCopyWarning
	}
	json.NewEncoder(w).Encode(response)
}

func main() {
	http.HandleFunc("/generate", handleGenerate)
	fmt.Println("Server running on port 9081...")
	http.ListenAndServe(":9081", nil)
}
