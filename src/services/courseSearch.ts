import { hasSupabase, supabase } from '@/services/supabase';
import type { CourseSearchResult } from '@/domain/courseSearch';

interface CourseSearchResponse {
  courses?: CourseSearchResult[];
  error?: string;
}

export async function searchCourses(query: string): Promise<CourseSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  if (!hasSupabase() || !supabase) {
    throw new Error('Course search is unavailable offline.');
  }

  const { data, error } = await supabase.functions.invoke<CourseSearchResponse>('course-search', {
    body: { query: trimmed },
  });

  if (error) throw new Error(error.message || 'Course search failed.');
  if (data?.error) throw new Error(data.error);
  return data?.courses || [];
}
