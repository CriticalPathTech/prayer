import { Link } from 'react-router-dom';

export function NotFoundPage(): JSX.Element {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2">
        <Link to="/" className="text-blue-600 underline">
          Go home
        </Link>
      </p>
    </div>
  );
}
