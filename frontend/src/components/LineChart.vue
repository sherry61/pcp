<template>
  <div>
    <!-- 确保 canvas 元素有 ref="lineChart" -->
    <canvas ref="lineChart"></canvas>
  </div>
</template>

<script>
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

export default {
  name: 'LineChart',
  props: {
    historyData: {
      type: Array,
      default: () => []
    }
  },
  mounted() {
    // 确保图表在 DOM 完全渲染后再进行绘制
    this.$nextTick(() => {
      this.renderChart(this.historyData);
    });
  },
  watch: {
    historyData: {
      immediate: true,
      handler(newData) {
        if (newData && newData.length > 0) {
          this.renderChart(newData);
        }
      }
    }
  },
  methods: {
    renderChart(data) {
      // 获取 canvas 上下文
      const ctx = this.$refs.lineChart.getContext('2d');

      // 如果图表已存在，销毁旧图表实例
      if (this._chart) {
        this._chart.destroy();
      }

      // 创建新的图表实例
      this._chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map(item => new Date(item.date).toLocaleDateString()),
          datasets: [
            {
              label: '交易数量',
              data: data.map(item => item.transaction_count),
              borderColor: '#3B82F6',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              yAxisID: 'y1',
              fill: true,
            },
            {
              label: '交易总额',
              data: data.map(item => item.sum_price),
              borderColor: 'rgba(255,99,132,1)',
              backgroundColor: 'rgba(255,99,132,0.2)',
              yAxisID: 'y2',
              fill: true,
            }
          ]
        },
      options: {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      title: {
        display: true,
        text: '日期'
      }
    },
    y1: {
      type: 'linear',
      position: 'left',
      title: {
        display: true,
        text: '交易数量'
      },
      beginAtZero: true,
      ticks: {
        precision: 0 // 显示整数，不带小数
      }
    },
    y2: {
      type: 'linear',
      position: 'right',
      title: {
        display: true,
        text: '交易总额（¥）'
      },
      grid: {
        drawOnChartArea: false
      }
    }
  }
}

      });
    }
  }
};
</script>

<style scoped>
canvas {
  width: 100% !important;
  height: 100% !important;
}
</style>
