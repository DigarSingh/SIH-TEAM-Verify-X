import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { api } from '../api/client';
import { keys } from '../api/keys';
import LoginPage from '../pages/auth/LoginPage';
import { PublicOnly, RequireAuth } from '../routes/guards';
import { errorBody, makeUser, mockApi, okBody, renderApp } from '../test/utils';
import { useAuth } from './useAuth';

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route element={<RequireAuth />}>
        <Route path="/account/password" element={<p>Choose a new password</p>} />
        <Route path="/trainee" element={<TraineeHome />} />
      </Route>
    </Routes>
  );
}

function TraineeHome() {
  const { user, logout } = useAuth();
  return (
    <div>
      <p>Trainee dashboard for {user?.name}</p>
      <button type="button" onClick={() => void logout()}>
        Sign out
      </button>
    </div>
  );
}

/** A server that knows one account: `/users/me` answers 401 until the sign-in call has happened. */
function serverWith(user = makeUser()) {
  const server = mockApi();
  let signedIn = false;
  server.on('GET', '/users/me', () => (signedIn ? okBody(user) : errorBody(401, 'UNAUTHENTICATED', 'Authentication required')));
  server.on('POST', '/auth/refresh', errorBody(401, 'INVALID_TOKEN', 'Invalid authentication token'));
  server.on('POST', '/auth/login', () => {
    signedIn = true;
    return okBody({ user });
  });
  server.on('POST', '/auth/logout', () => {
    signedIn = false;
    return okBody({});
  });
  return server;
}

async function signIn() {
  const typing = userEvent.setup();
  await typing.type(await screen.findByLabelText('Email'), 'trainee@imd.gov.in');
  await typing.type(screen.getByLabelText('Password'), 'Str0ng!Passw0rd');
  await typing.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('signing in', () => {
  it('opens the dashboard of the signed-in role', async () => {
    serverWith();
    renderApp(<AppRoutes />, { route: '/login' });
    await signIn();
    expect(await screen.findByText('Trainee dashboard for Dr. Ananya Rao')).toBeInTheDocument();
  });

  it('sends a user with a temporary password straight to the password change (regression)', async () => {
    // Clearing the whole query cache on sign-in destroyed the session query the provider was watching, so the
    // guard still saw "signed out" and bounced the user back to the sign-in page instead of the password change.
    serverWith(makeUser({ mustChangePassword: true }));
    renderApp(<AppRoutes />, { route: '/login' });
    await signIn();
    expect(await screen.findByText('Choose a new password')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /sign in to capacity connect/i })).not.toBeInTheDocument();
  });

  it('never shows the previous account’s cached data to the next person', async () => {
    serverWith();
    const { queryClient } = renderApp(<AppRoutes />, { route: '/login' });
    queryClient.setQueryData(keys.passport, { owner: 'someone else' });
    await signIn();
    await screen.findByText('Trainee dashboard for Dr. Ananya Rao');
    expect(queryClient.getQueryData(keys.passport)).toBeUndefined();
  });
});

describe('signing out and expiry', () => {
  it('signs out locally, forgets cached data and returns to the sign-in page', async () => {
    serverWith();
    const { queryClient } = renderApp(<AppRoutes />, { route: '/trainee', user: makeUser() });
    queryClient.setQueryData(keys.passport, { owner: 'me' });

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: /sign in to capacity connect/i })).toBeInTheDocument();
    expect(queryClient.getQueryData(keys.passport)).toBeUndefined();
  });

  it('signs out even when the network call fails', async () => {
    const server = serverWith();
    server.on('POST', '/auth/logout', errorBody(500, 'INTERNAL_ERROR', 'An unexpected error occurred.'));
    renderApp(<AppRoutes />, { route: '/trainee', user: makeUser() });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: /sign in to capacity connect/i })).toBeInTheDocument();
  });

  it('returns to sign-in with a notice when the session can no longer be refreshed', async () => {
    const server = serverWith();
    server.on('GET', '/courses', errorBody(401, 'TOKEN_EXPIRED', 'Your session has expired'));
    renderApp(<AppRoutes />, { route: '/trainee', user: makeUser() });
    await screen.findByText('Trainee dashboard for Dr. Ananya Rao');

    // any request that finds the session gone
    await act(async () => {
      await api.get('/courses').catch(() => undefined);
    });

    expect(await screen.findByRole('heading', { name: /sign in to capacity connect/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Your session expired. Please sign in again.')).toBeInTheDocument());
  });
});
