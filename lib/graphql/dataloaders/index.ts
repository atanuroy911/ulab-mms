import DataLoader from 'dataloader';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import Course from '@/models/Course';
import Exam from '@/models/Exam';
import Mark from '@/models/Mark';

export interface Loaders {
  userLoader: DataLoader<string, any>;
  courseLoader: DataLoader<string, any>;
  examLoader: DataLoader<string, any>;
  marksByCourseLoader: DataLoader<string, any[]>;
  examsByCourseLoader: DataLoader<string, any[]>;
}

export function createLoaders(): Loaders {
  const userLoader = new DataLoader<string, any>(async (ids) => {
    await dbConnect();
    const users = await User.find({ _id: { $in: ids } });
    const userMap = new Map(users.map(user => [user._id.toString(), user]));
    return ids.map(id => userMap.get(id) || null);
  });

  const courseLoader = new DataLoader<string, any>(async (ids) => {
    await dbConnect();
    const courses = await Course.find({ _id: { $in: ids } });
    const courseMap = new Map(courses.map(course => [course._id.toString(), course]));
    return ids.map(id => courseMap.get(id) || null);
  });

  const examLoader = new DataLoader<string, any>(async (ids) => {
    await dbConnect();
    const exams = await Exam.find({ _id: { $in: ids } });
    const examMap = new Map(exams.map(exam => [exam._id.toString(), exam]));
    return ids.map(id => examMap.get(id) || null);
  });

  const marksByCourseLoader = new DataLoader<string, any[]>(async (courseIds) => {
    await dbConnect();
    const marks = await Mark.find({ courseId: { $in: courseIds } });
    const marksMap = new Map<string, any[]>();

    marks.forEach(mark => {
      const courseId = mark.courseId.toString();
      if (!marksMap.has(courseId)) {
        marksMap.set(courseId, []);
      }
      marksMap.get(courseId)!.push(mark);
    });

    return courseIds.map(id => marksMap.get(id) || []);
  });

  const examsByCourseLoader = new DataLoader<string, any[]>(async (courseIds) => {
    await dbConnect();
    const exams = await Exam.find({ courseId: { $in: courseIds } });
    const examsMap = new Map<string, any[]>();

    exams.forEach(exam => {
      const courseId = exam.courseId.toString();
      if (!examsMap.has(courseId)) {
        examsMap.set(courseId, []);
      }
      examsMap.get(courseId)!.push(exam);
    });

    return courseIds.map(id => examsMap.get(id) || []);
  });

  return {
    userLoader,
    courseLoader,
    examLoader,
    marksByCourseLoader,
    examsByCourseLoader,
  };
}
