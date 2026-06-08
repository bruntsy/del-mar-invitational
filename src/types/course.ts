export interface CourseTee {
  name: string;
  gender?: string;
  rating: number;
  slope: number;
  parTotal: number;
  yards?: number;
}

export interface Course {
  id?: string;
  clubName?: string;
  courseName?: string;
  location?: string;
  tee: CourseTee;
  par: number[];
  si: number[];
  yds: number[];
}
