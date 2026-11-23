// 试卷扩展信息：预览 PDF 地址 + 重排版试卷头（预览内容与下载文件同源，保证一致）
// 每份支持预览的试卷在此登记 id → previewUrl；后续接入真实试卷只需加条目
export const PAPER_EXTRAS = {
  // 汉光中学九上期中数学：PDF 已本地托管在 public/papers/
  'p-174': {
    previewUrl: '/papers/hanguang-g9-midterm.pdf',
    retypeset: {
      title: '初三数学测试卷',
      subtitle: '考试时间：120分钟　满分：120分',
      sections: [
        { title: '一. 选择题（共 12 小题，每题 3 分，共 36 分.）', from: 'hg-q1', to: 'hg-q12' },
        { title: '二. 填空题（共 4 小题，共 12 分.）', from: 'hg-q13', to: 'hg-q16' },
        { title: '三. 解答题（共 8 小题；72 分）', from: 'hg-q17', to: 'hg-q24' }
      ]
    }
  }
}
