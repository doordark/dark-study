import { router } from 'expo-router';

import { CourseScheduleScreen } from '@/screens/CourseScheduleScreen';
import { useActiveSchedule } from '@/store/useStore';

export default function Home() {
  const schedule = useActiveSchedule();
  return (
    <CourseScheduleScreen
      // 切换课表或调整开学日期后重置浏览状态（回到当前周）
      key={`${schedule.id}:${schedule.startDate}`}
      onImport={() => router.push('/import')}
      onAssistant={() => router.push('/assistant')}
      onGrades={() => router.push('/grades')}
      onSettings={() => router.push('/settings')}
    />
  );
}
