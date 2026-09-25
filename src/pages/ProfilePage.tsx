import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useState
} from 'react';

import { Link, useNavigate } from 'react-router-dom';

import {
  ApiError,
  Customer,
  getMyProfile,
  updateMyProfile
} from '../services/api';

import { Navbar } from '../app/components/Navbar/Navbar';
import { useAuth } from '../features/auth/hooks';

// @ts-ignore: CSS file is imported for styling
import "../styles/index.css";

interface ProfileForm {
  name: string;
  email: string;
  phone: string;
}

const emptyForm: ProfileForm = {
  name: '',
  email: '',
  phone: ''
};

/**
 * Shared page chrome for the signed-in profile screen. The site header is
 * rendered here because the profile route sits outside the home page layout.
 */
function ProfileShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="profile-page profile-page--with-header">
        {children}
      </main>
    </>
  );
}

function formatRegistrationDate(
  dateValue: string
): string {
  if (!dateValue) {
    return 'Not available';
  }

  return new Date(dateValue).toLocaleDateString(
    'en-UG',
    {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();

  const [profile, setProfile] =
    useState<Customer | null>(null);

  const [form, setForm] =
    useState<ProfileForm>(emptyForm);

  const [isEditing, setIsEditing] =
    useState<boolean>(false);

  const [isLoading, setIsLoading] =
    useState<boolean>(true);

  const [isSaving, setIsSaving] =
    useState<boolean>(false);

  const [message, setMessage] =
    useState<string>('');

  const [error, setError] =
    useState<string>('');

  useEffect(() => {
    async function loadProfile() {
      try {
        const response = await getMyProfile();

        if (!response.user) {
          throw new Error(
            'Customer profile was not returned'
          );
        }

        setProfile(response.user);

        // Keep the session user in sync with the freshest server copy so the
        // header and protected routes show the same account details.
        updateUser({
          id: String(response.user.id),
          email: response.user.email,
          name: response.user.name,
          role: response.user.role
        });

        setForm({
          name: response.user.name || '',
          email: response.user.email || '',
          phone: response.user.phone || ''
        });
      } catch (requestError) {
        // An expired or rejected session must send the customer back to login
        // instead of showing a dead profile page.
        if (
          requestError instanceof ApiError &&
          requestError.status === 401
        ) {
          navigate(
            '/login?redirect=%2Fprofile',
            { replace: true }
          );
          return;
        }

        const errorMessage =
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load profile';

        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, [navigate, updateUser]);

  function handleChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const { name, value } = event.target;

    setForm(currentForm => ({
      ...currentForm,
      [name]: value
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage('');
    setError('');
    setIsSaving(true);

    try {
      const response =
        await updateMyProfile(form);

      if (!response.user) {
        throw new Error(
          'Updated profile was not returned'
        );
      }

      setProfile(response.user);

      // Reflect the saved name/email in the AuthProvider so the header and
      // other signed-in screens show the updated account immediately.
      updateUser({
        id: String(response.user.id),
        email: response.user.email,
        name: response.user.name,
        role: response.user.role
      });

      setForm({
        name: response.user.name || '',
        email: response.user.email || '',
        phone: response.user.phone || ''
      });

      setIsEditing(false);
      setMessage(
        'Your profile was updated successfully.'
      );
    } catch (requestError) {
      // An expired session must not leave the customer stuck on an edit form.
      if (
        requestError instanceof ApiError &&
        requestError.status === 401
      ) {
        navigate(
          '/login?redirect=%2Fprofile',
          { replace: true }
        );
        return;
      }

      const errorMessage =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to update profile';

      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (!profile) {
      return;
    }

    setForm({
      name: profile.name || '',
      email: profile.email || '',
      phone: profile.phone || ''
    });

    setIsEditing(false);
    setMessage('');
    setError('');
  }

  if (isLoading) {
    return (
      <ProfileShell>
        <p>Loading customer profile...</p>
      </ProfileShell>
    );
  }

  if (!profile) {
    return (
      <ProfileShell>
        <h1>My Profile</h1>
        <p className="profile-error">
          {error || 'Profile could not be loaded.'}
        </p>
        <Link to="/login?redirect=%2Fprofile" className="primary-button">
          Sign in again
        </Link>
      </ProfileShell>
    );
  }

  return (
    <ProfileShell>
      <section className="profile-heading">
        <div>
          <p className="profile-label">
            Panda Motors customer account
          </p>

          <h1>My Profile</h1>

          <p>
            View and update your dealership account
            information.
          </p>
        </div>

        {!isEditing && (
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setIsEditing(true);
              setMessage('');
              setError('');
            }}
          >
            Edit Profile
          </button>
        )}
      </section>

      {message && (
        <p
          className="profile-success"
          role="status"
        >
          {message}
        </p>
      )}

      {error && (
        <p
          className="profile-error"
          role="alert"
        >
          {error}
        </p>
      )}

      <section className="profile-card">
        {isEditing ? (
          <form onSubmit={handleSubmit}>
            <div className="profile-form-group">
              <label htmlFor="name">
                Full name
              </label>

              <input
                id="name"
                name="name"
                type="text"
                value={form.name}
                onChange={handleChange}
                required
              />
            </div>

            <div className="profile-form-group">
              <label htmlFor="email">
                Email address
              </label>

              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="profile-form-group">
              <label htmlFor="phone">
                Phone number
              </label>

              <input
                id="phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder="+256 700 000 000"
              />
            </div>

            <div className="profile-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={isSaving}
              >
                {isSaving
                  ? 'Saving...'
                  : 'Save Changes'}
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="profile-information">
            <div className="profile-row">
              <span>Full name</span>
              <strong>
                {profile.name || 'Not provided'}
              </strong>
            </div>

            <div className="profile-row">
              <span>Email address</span>
              <strong>
                {profile.email || 'Not provided'}
              </strong>
            </div>

            <div className="profile-row">
              <span>Phone number</span>
              <strong>
                {profile.phone || 'Not provided'}
              </strong>
            </div>

            <div className="profile-row">
              <span>Registered on</span>
              <strong>
                {formatRegistrationDate(
                  profile.created_at
                )}
              </strong>
            </div>

            <div className="profile-row">
              <span>Account type</span>
              <strong>
                {profile.role || 'Customer'}
              </strong>
            </div>
          </div>
        )}
      </section>
    </ProfileShell>
  );
}
