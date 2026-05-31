module.exports = {
  devServer: {
    host: '0.0.0.0',
    port: 8085,
    https: true,
    proxy: {

      // ===== CA 服务 =====
      '/api/ca': {
        target: 'http://10.112.47.214:8090',
        changeOrigin: true,
        pathRewrite: {
          '^/api/ca': '/api/ca'
        },
        secure: false
      },

      // ===== 主后端 API =====
      '/api': {
        target: 'http://10.112.47.214:8080',
        changeOrigin: true,
        pathRewrite: {
          '^/api': '/api'
        }
      },

      // ===== AI 生成服务 =====
      '/generate': {
        target: 'http://10.112.47.214:9081',
        changeOrigin: true,
        pathRewrite: {
          '^/generate': '/generate'
        },
        secure: false
      },

      // ===== ECharts 示例代理 =====
      '/api/echarts': {
        target: 'https://echarts.apache.org',
        changeOrigin: true,
        pathRewrite: {
          '^/api/echarts': '/examples'
        }
      },

      
      '/catalogapi': {
        target: 'http://10.112.47.214:8008',
        changeOrigin: true,
        pathRewrite: {
          '^/catalogapi': ''
        },
        secure: false
      }

    }
  }
};
