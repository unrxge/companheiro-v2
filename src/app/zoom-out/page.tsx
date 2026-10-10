import { redirect } from 'next/navigation'

// Zoom out was retired on 2026-10-10: talking a direction through now happens
// per project, in the room its canvas opens ("Talk about the vision"). An old
// link or bookmark lands on the Project Board. The trajectories table and
// what people wrote there are kept; nothing reads them any more.
export default function ZoomOutPage() {
  redirect('/project-board')
}
