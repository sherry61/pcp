#!/bin/bash
set -euo pipefail

contractName=${1:-}
if [[ -z "$contractName" ]]; then
	echo "contractName is empty. use as: ./build.sh contractName"
	exit 1
fi

go mod tidy
go build -ldflags="-s -w" -o "$contractName"
7z a "$contractName" "$contractName"
rm -f "$contractName"
