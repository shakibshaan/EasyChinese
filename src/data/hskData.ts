export interface HSKQuestion {
  id: number;
  type: 'true_false' | 'multiple_choice_image' | 'multiple_choice_text';
  audioTimestamp?: number;
  imageUrl?: string;
  options?: string[];
  correctAnswer: boolean | string;
}

export interface HSKLesson {
  id: number;
  title: string;
  audioUrl: string;
  questions: HSKQuestion[];
}

export const hsk2Lessons: HSKLesson[] = [
  {
    id: 1,
    title: "Lesson 1: 九月去北京旅游最好",
    audioUrl: "/audio/hsk2/lesson1.mp3",
    questions: [
      // Part 1: True/False
      { id: 1, type: 'true_false', imageUrl: "/images/hsk2/l1/q1.png", correctAnswer: false },
      { id: 2, type: 'true_false', imageUrl: "/images/hsk2/l1/q2.png", correctAnswer: true },
      { id: 3, type: 'true_false', imageUrl: "/images/hsk2/l1/q3.png", correctAnswer: true },
      { id: 4, type: 'true_false', imageUrl: "/images/hsk2/l1/q4.png", correctAnswer: false },
      { id: 5, type: 'true_false', imageUrl: "/images/hsk2/l1/q5.png", correctAnswer: true },
      // Part 2: Multiple Choice Images
      { id: 6, type: 'multiple_choice_image', correctAnswer: 'D' },
      { id: 7, type: 'multiple_choice_image', correctAnswer: 'A' },
      { id: 8, type: 'multiple_choice_image', correctAnswer: 'B' },
      { id: 9, type: 'multiple_choice_image', correctAnswer: 'C' },
      { id: 10, type: 'multiple_choice_image', correctAnswer: 'E' },
      // Part 3: Multiple Choice Text
      { id: 11, type: 'multiple_choice_text', options: ['A 八月', 'B 几个月', 'C 九月'], correctAnswer: 'C' },
      { id: 12, type: 'multiple_choice_text', options: ['A 太远了', 'B 太冷了', 'C 太热了'], correctAnswer: 'B' },
      { id: 13, type: 'multiple_choice_text', options: ['A 桌子', 'B 椅子', 'C 杯子'], correctAnswer: 'B' },
      { id: 14, type: 'multiple_choice_text', options: ['A 不到十岁', 'B 四十岁', 'C 十多岁'], correctAnswer: 'C' },
      { id: 15, type: 'multiple_choice_text', options: ['A 杯子', 'B 北京', 'C 茶杯'], correctAnswer: 'A' },
    ]
  }
];
