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
