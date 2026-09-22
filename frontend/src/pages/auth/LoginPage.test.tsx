import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { errorBody, makeUser, mockApi, okBody, renderApp } from '../../test/utils';
import LoginPage from './LoginPage';

function Tree() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/trainer" element={<p>Trainer dashboard</p>} />
    </Routes>
  );
}

function signedOutServer() {
  const server = mockApi();
  server.on('GET', '/users/me', errorBody(401, 'UNAUTHENTICATED', 'Authentication required'));
  return server;
}

const setup = () => {
  renderApp(<Tree />, { route: '/login', user: null });
  return userEvent.setup();
};

describe('sign-in page', () => {
  it('puts the form in the main region under the only level-one heading', () => {
    signedOutServer();
    setup();
    expect(screen.getByRole('main')).toContainElement(screen.getByLabelText('Email'));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in to Capacity Connect');
  });

  it('asks for both fields before contacting the server', async () => {
    const server = signedOutServer();
    const typing = setup();
    await typing.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(server.callsTo('POST', '/auth/login')).toHaveLength(0);
  });

  it('rejects a malformed email address', async () => {
    signedOutServer();
    const typing = setup();
    await typing.type(screen.getByLabelText('Email'), 'not-an-email');
    await typing.type(screen.getByLabelText('Password'), 'x');
    await typing.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('shows the server’s message for wrong credentials, without revealing which part was wrong', async () => {
    const server = signedOutServer();
    server.on('POST', '/auth/login', errorBody(401, 'INVALID_CREDENTIALS', 'Incorrect email or password'));
    const typing = setup();
    await typing.type(screen.getByLabelText('Email'), 'trainee@imd.gov.in');
    await typing.type(screen.getByLabelText('Password'), 'wrong password');
    await typing.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
  });

  it.each([
    ['ACCOUNT_PENDING', 'Your account is waiting for administrator approval.'],
    ['ACCOUNT_LOCKED', 'Too many failed attempts. Try again in 15 minutes.'],
  ])('explains an account that cannot sign in yet (%s) as a notice, not as an error', async (code, message) => {
    const server = signedOutServer();
    server.on('POST', '/auth/login', errorBody(403, code, message));
    const typing = setup();
    await typing.type(screen.getByLabelText('Email'), 'new.user@imd.gov.in');
    await typing.type(screen.getByLabelText('Password'), 'Str0ng!Passw0rd');
    await typing.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sends the entered credentials and opens the workspace of the account’s role', async () => {
    const server = signedOutServer();
    const trainer = makeUser({ role: 'TRAINER', email: 'trainer@imd.gov.in' });
    let signedIn = false;
    server.on('POST', '/auth/refresh', errorBody(401, 'INVALID_TOKEN', 'Invalid authentication token'));
    server.on('GET', '/users/me', () => (signedIn ? okBody(trainer) : errorBody(401, 'UNAUTHENTICATED', 'Authentication required')));
    server.on('POST', '/auth/login', () => {
      signedIn = true;
      return okBody({ user: trainer });
    });
    const typing = setup();
    await typing.type(screen.getByLabelText('Email'), '  trainer@imd.gov.in ');
    await typing.type(screen.getByLabelText('Password'), 'Str0ng!Passw0rd');
    await typing.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Trainer dashboard')).toBeInTheDocument();
    expect(server.callsTo('POST', '/auth/login')[0]?.body).toEqual({ email: 'trainer@imd.gov.in', password: 'Str0ng!Passw0rd' }); // surrounding spaces are trimmed
  });

  it('offers demo accounts in development that fill in the email', async () => {
    signedOutServer();
    const typing = setup();
    await typing.click(screen.getByRole('button', { name: /use the trainer demo account/i }));
    expect(screen.getByLabelText('Email')).toHaveValue('trainer@imd.gov.in');
  });

  it('can reveal the password while typing', async () => {
    signedOutServer();
    const typing = setup();
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');
    await typing.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
  });
});
