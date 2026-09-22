import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { makeUser, mockApi, renderApp } from '../test/utils';
import { PublicOnly, RequireAuth, RequireRole } from './guards';

function SignInStub() {
  const location = useLocation();
  return <p>Sign-in page {JSON.stringify(location.state)}</p>;
}

function Tree() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <SignInStub />
          </PublicOnly>
        }
      />
      <Route element={<RequireAuth />}>
        <Route path="/account/password" element={<p>Password change</p>} />
        <Route element={<RequireRole roles={['TRAINEE']} />}>
          <Route path="/trainee" element={<p>Trainee area</p>} />
        </Route>
        <Route element={<RequireRole roles={['TRAINER']} />}>
          <Route path="/trainer" element={<p>Trainer area</p>} />
        </Route>
        <Route element={<RequireRole roles={['ADMIN']} />}>
          <Route path="/admin" element={<p>Admin area</p>} />
        </Route>
      </Route>
    </Routes>
  );
}

const asRole = (role: 'TRAINEE' | 'TRAINER' | 'ADMIN') => makeUser({ role });

describe('route guards', () => {
  it('sends a signed-out visitor to sign-in and remembers where they were going', async () => {
    renderApp(<Tree />, { route: '/trainee?tab=x', user: null });
    expect(await screen.findByText(/Sign-in page/)).toHaveTextContent('"from":"/trainee?tab=x"');
    expect(screen.queryByText('Trainee area')).not.toBeInTheDocument();
  });

  it('shows a splash while the session is being restored, never the page', () => {
    const server = mockApi();
    server.on('GET', '/users/me', () => new Promise(() => undefined)); // never answers
    renderApp(<Tree />, { route: '/trainee' });
    expect(screen.getByRole('status', { name: 'Restoring your session' })).toBeInTheDocument();
    expect(screen.queryByText('Trainee area')).not.toBeInTheDocument();
  });

  it.each([
    ['TRAINEE', '/trainee', 'Trainee area'],
    ['TRAINER', '/trainer', 'Trainer area'],
    ['ADMIN', '/admin', 'Admin area'],
  ] as const)('lets a %s into their own workspace', async (role, route, text) => {
    renderApp(<Tree />, { route, user: asRole(role) });
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it.each([
    ['TRAINEE', '/trainer', 'Trainer area'],
    ['TRAINEE', '/admin', 'Admin area'],
    ['TRAINER', '/admin', 'Admin area'],
    ['TRAINER', '/trainee', 'Trainee area'],
    ['ADMIN', '/trainer', 'Trainer area'],
  ] as const)('shows a %s the access-denied page for %s (the server enforces the same rule)', async (role, route, hidden) => {
    renderApp(<Tree />, { route, user: asRole(role) });
    expect(await screen.findByRole('heading', { name: 'You do not have access to this page' })).toBeInTheDocument();
    expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to my dashboard' })).toHaveAttribute('href', `/${role.toLowerCase()}`);
  });

  it('holds a user with a temporary password on the password change until they set a new one', async () => {
    renderApp(<Tree />, { route: '/trainee', user: makeUser({ mustChangePassword: true }) });
    expect(await screen.findByText('Password change')).toBeInTheDocument();
    expect(screen.queryByText('Trainee area')).not.toBeInTheDocument();
  });

  it('does not show sign-in to someone who is already signed in', async () => {
    renderApp(<Tree />, { route: '/login', user: asRole('TRAINER') });
    expect(await screen.findByText('Trainer area')).toBeInTheDocument();
  });

  it('returns a signed-in user to where they were going, but never follows an unsafe target', async () => {
    const { unmount } = renderApp(<Tree />, { route: { pathname: '/login', state: { from: '/trainer?tab=x' } }, user: asRole('TRAINER') });
    expect(await screen.findByText('Trainer area')).toBeInTheDocument(); // an in-app target is honoured
    unmount();

    for (const from of ['//evil.example', '/trainer\\evil.example', 'https://evil.example', '/admin']) {
      const view = renderApp(<Tree />, { route: { pathname: '/login', state: { from } }, user: asRole('TRAINER') });
      expect(await screen.findByText('Trainer area')).toBeInTheDocument(); // falls back to the user's own home
      view.unmount();
    }
  });
});
