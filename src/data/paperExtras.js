// 试卷扩展信息：重排版试卷头（不再托管原卷 PDF，只保留题目图形与重排正文）
export const PAPER_EXTRAS = {
  // 汉光中学九上期中数学
  'p-174': {
    retypeset: {
      title: '初三数学测试卷',
      subtitle: '考试时间：120分钟　满分：120分',
      sections: [
        { title: '一. 选择题（共 12 小题，每题 3 分，共 36 分.）', from: 'hg-q1', to: 'hg-q12' },
        { title: '二. 填空题（共 4 小题，共 12 分.）', from: 'hg-q13', to: 'hg-q16' },
        { title: '三. 解答题（共 8 小题；72 分）', from: 'hg-q17', to: 'hg-q24' }
      ]
    }
  },
  // 锦玉中学八上期中数学
  'p-182': {
    retypeset: {
      title: '初二数学测试卷',
      subtitle: '考试时间：120分钟　满分：120分',
      sections: [
        { title: '一. 选择题（共 12 小题，每小题 3 分，共 36 分.）', from: 'jy-q1', to: 'jy-q12' },
        { title: '二. 填空题（共 4 小题，每小题 3 分，共 12 分.）', from: 'jy-q13', to: 'jy-q16' },
        { title: '三. 解答题（共 8 小题，共 72 分.）', from: 'jy-q17', to: 'jy-q24' }
      ]
    }
  }
}
