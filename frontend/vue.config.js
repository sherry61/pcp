const transactionSupervisionTarget = process.env.VUE_APP_TRANSACTION_SUPERVISION_API_TARGET;

module.exports = {
  chainWebpack: config => {
    config.module
      .rule('js')
      .use('babel-loader')
      .tap(options => ({
        ...options,
        cacheDirectory: false,
        cacheCompression: false,
      }));
  },
  devServer: {
    host: '0.0.0.0',
    port: 8085,
    https: true,
    proxy: {
      // ===== Node 后端（默认 3000）=====
      // https 页面下浏览器会拦截到 http://10.112.191.163:3000 的直连请求（混合内容），
      // 前端 main.js 会把这类地址改写为同源 /node-api 走此代理。
      '/node-api': {
        target: 'http://10.112.191.163:3000',
        changeOrigin: true,
        pathRewrite: {
          '^/node-api': ''
        },
        secure: false
      },
      '/api/transaction-supervision': {
          target: transactionSupervisionTarget,
          changeOrigin: true,
          pathRewrite: {
          '^/api/transaction-supervision': '/api/transaction-supervision'
        },
          secure: false
        },
      // ===== CA 服务 =====
      '/api/ca': {
        target: 'http://10.112.191.163:8090',
        changeOrigin: true,
        pathRewrite: {
          '^/api/ca': '/api/ca'
        },
        secure: false
      },

      // ===== 主后端 API =====
      '/api': {
        target: 'http://10.112.191.163:8080',
        changeOrigin: true,
        pathRewrite: {
          '^/api': '/api'
        }
      },

      // ===== AI 生成服务 =====
      '/generate': {
        target: 'http://10.112.191.163:9081',
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
        target: 'http://10.112.191.163:8008',
        changeOrigin: true,
        pathRewrite: {
          '^/catalogapi': ''
        },
        secure: false
      }

    }
  }
};
