# 构建阶段
FROM golang:1.20-bullseye AS builder

# 使用阿里云镜像源加速
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list \
    && sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list \
    && apt-get update

# 设置 Go 代理
RUN go env -w GOPROXY="https://mirrors.aliyun.com/goproxy,direct"

# 安装必要的系统依赖（包含混淆电路和IT-MAC所需的库）
RUN apt-get update && apt-get install -y gcc g++ make git libgmp-dev libssl-dev && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制 go mod 文件
COPY go.mod go.sum ./

# 下载依赖
RUN go mod download

# 复制源代码
COPY . .

# 编译主程序
RUN CGO_ENABLED=1 GOOS=linux go build -a -o main ./server/main.go

# 运行阶段 - 使用 Debian slim
FROM debian:bullseye-slim

# 使用阿里云镜像源
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list \
    && sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list

# 安装必要的运行时依赖
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /root/

# 从构建阶段复制文件
RUN mkdir logs
COPY --from=builder /app/main .
COPY --from=builder /app/config ./config
COPY --from=builder /app/contracts/authorization/*.7z ./contracts/authorization
COPY --from=builder /app/contracts/verification/*.7z ./contracts/verification
COPY --from=builder /app/contracts/gc_audit/*.7z ./contracts/gc_audit
COPY --from=builder /app/contracts/vfl_audit/*.7z ./contracts/vfl_audit

# 暴露端口
EXPOSE 8091

# 设置环境变量
ENV ENABLE_GARBLED_CIRCUIT=true
ENV ENABLE_ITMAC_AUDIT=true

# 运行程序
CMD ["./main"]
