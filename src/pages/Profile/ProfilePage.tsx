import {
  CalendarDays,
  CarFront,
  Mail,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate } from 'react-router-dom';
import {
  ApiError,
  getMyProfile,
  updateMyProfile,
} from '../../services/api';
import type { Customer } from '../../services/api';
import { Navbar } from '../../app/components/Navbar/Navbar';
import { useAuth } from '../../features/auth/hooks';
import { BookingHistory } from '../../features/profile/components/BookingHistory';

import "../../styles/index.css";
import "./ProfilePage.css";

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
      <main className="profile-page profile-page--with-header profile-page--account">
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

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return date.toLocaleDateString(
    'en-UG',
    {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }
  );
}

function getInitials(name: string, email: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();

  return initials || email.trim().charAt(0).toUpperCase() || 'P';
}

function formatRole(role: string | null | undefined): string {
  const normalizedRole = (role || 'customer')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();

  if (normalizedRole === 'user' || normalizedRole === 'customer') {
    return 'Customer';
  }

  if (normalizedRole === 'admin') {
    return 'Administrator';
  }

  return normalizedRole
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
        <div className="profile-account-container">
          <div className="profile-loading" aria-busy="true" aria-live="polite">
            <span className="profile-visually-hidden">Loading customer profile…</span>
            <div className="profile-loading-avatar" />
            <div className="profile-loading-copy">
              <span />
              <span />
              <span />
            </div>
            <div className="profile-loading-panel" />
          </div>
        </div>
      </ProfileShell>
    );
  }

  if (!profile) {
    return (
      <ProfileShell>
        <div className="profile-account-container">
          <section className="profile-unavailable" role="alert">
            <span className="profile-unavailable-icon">
              <UserRound size={24} aria-hidden="true" />
            </span>
            <p className="profile-label">Customer account</p>
            <h1>Profile unavailable</h1>
            <p className="profile-unavailable-copy">
              {error || 'Your profile could not be loaded. Please sign in again.'}
            </p>
            <Link to="/login?redirect=%2Fprofile" className="primary-button">
              Sign in again
            </Link>
          </section>
        </div>
      </ProfileShell>
    );
  }

  const firstName = profile.name?.trim().split(/\s+/)[0];
  const initials = getInitials(profile.name || '', profile.email || '');

  return (
    <ProfileShell>
      <div className="profile-account-container">
        <header className="profile-account-hero">
          <div className="profile-account-avatar" aria-hidden="true">
            {initials}
          </div>
          <div className="profile-account-intro">
            <p className="profile-label">Panda Motors · Customer account</p>
            <h1>{firstName ? `Welcome back, ${firstName}` : 'Your account'}</h1>
            <p>
              Your Panda Motors account for personal details and test-drive
              appointments.
            </p>
          </div>
          <div className="profile-account-actions">
            <span className="profile-role-badge">
              <ShieldCheck size={15} aria-hidden="true" />
              {formatRole(profile.role)}
            </span>
            {!isEditing && (
              <button
                type="button"
                className="primary-button profile-edit-button"
                onClick={() => {
                  setIsEditing(true);
                  setMessage('');
                  setError('');
                }}
              >
                <Pencil size={16} aria-hidden="true" />
                Edit profile
              </button>
            )}
          </div>
        </header>

        {message && (
          <p className="profile-feedback profile-success" role="status">
            <ShieldCheck size={18} aria-hidden="true" />
            {message}
          </p>
        )}

        {error && (
          <p className="profile-feedback profile-error" role="alert">
            {error}
          </p>
        )}

        <section className="profile-card profile-account-card" aria-labelledby="profile-details-title">
          <div className="profile-section-heading">
            <div className="profile-section-icon">
              <UserRound size={19} aria-hidden="true" />
            </div>
            <div>
              <p className="profile-section-eyebrow">Account details</p>
              <h2 id="profile-details-title">
                {isEditing ? 'Update your information' : 'Personal information'}
              </h2>
              <p>
                {isEditing
                  ? 'Make changes to the details associated with your account.'
                  : 'The contact details connected to your Panda Motors account.'}
              </p>
            </div>
          </div>

          {isEditing ? (
            <form onSubmit={handleSubmit} className="profile-edit-form">
              <div className="profile-edit-grid">
                <div className="profile-form-group">
                  <label htmlFor="name">Full name</label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="profile-form-group">
                  <label htmlFor="email">Email address</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="profile-form-group profile-form-group-wide">
                  <label htmlFor="phone">Phone number</label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="+256 700 000 000"
                  />
                </div>
              </div>

              <div className="profile-actions">
                <button
                  type="submit"
                  className="primary-button profile-save-button"
                  disabled={isSaving}
                >
                  <Save size={16} aria-hidden="true" />
                  {isSaving ? 'Saving changes…' : 'Save changes'}
                </button>
                <button
                  type="button"
                  className="secondary-button profile-cancel-button"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  <X size={16} aria-hidden="true" />
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <dl className="profile-information-grid">
              <div className="profile-information-item">
                <dt><UserRound size={16} aria-hidden="true" /> Full name</dt>
                <dd>{profile.name || 'Not provided'}</dd>
              </div>
              <div className="profile-information-item">
                <dt><Mail size={16} aria-hidden="true" /> Email address</dt>
                <dd>{profile.email || 'Not provided'}</dd>
              </div>
              <div className="profile-information-item">
                <dt><Phone size={16} aria-hidden="true" /> Phone number</dt>
                <dd>{profile.phone || 'Not provided'}</dd>
              </div>
              <div className="profile-information-item">
                <dt><CalendarDays size={16} aria-hidden="true" /> Member since</dt>
                <dd>{formatRegistrationDate(profile.created_at)}</dd>
              </div>
              <div className="profile-information-item profile-information-item-wide">
                <dt><ShieldCheck size={16} aria-hidden="true" /> Account type</dt>
                <dd>{formatRole(profile.role)}</dd>
              </div>
            </dl>
          )}
        </section>

        <section className="profile-bookings" aria-label="Test-drive history">
          <div className="profile-bookings-heading">
            <div className="profile-section-icon">
              <CarFront size={19} aria-hidden="true" />
            </div>
            <div>
              <p className="profile-section-eyebrow">Your appointments</p>
              <h2>Test-drive history</h2>
            </div>
          </div>
          <BookingHistory showTitle={false} />
        </section>
      </div>
    </ProfileShell>
  );
}
