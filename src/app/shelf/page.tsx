import { redirect } from 'next/navigation'

// The shelf is now called the Project Board and lives at /project-board.
// Kept so old links and bookmarks still land in the right place.
export default function ShelfRedirect() {
  redirect('/project-board')
}
