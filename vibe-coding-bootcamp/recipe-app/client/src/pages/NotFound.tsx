import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { StatusMessage } from '@/components/StatusMessage';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export default function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <StatusMessage
      title="Page not found"
      description="There's nothing at this address."
      action={
        <Button asChild>
          <Link to="/">Browse recipes</Link>
        </Button>
      }
    />
  );
}
