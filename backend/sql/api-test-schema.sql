--
-- PostgreSQL database dump
--

\restrict yU1dK1dKG2kiRrAfcxaoGbwf0G7N6Buj3pIEzL1H6USgXLSZAeLXiums3gG6aNm

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: car_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.car_images (
    id integer NOT NULL,
    car_id integer NOT NULL,
    image_url text NOT NULL,
    is_primary boolean DEFAULT false,
    image_type character varying(30) DEFAULT 'general'::character varying NOT NULL,
    sort_order integer DEFAULT 0,
    cloudinary_public_id text,
    cloudinary_format character varying(20),
    width integer,
    height integer,
    bytes bigint,
    CONSTRAINT car_images_image_type_check CHECK (((image_type)::text = ANY (ARRAY[('primary'::character varying)::text, ('general'::character varying)::text, ('front'::character varying)::text, ('rear'::character varying)::text, ('interior'::character varying)::text, ('engine'::character varying)::text])))
);


--
-- Name: car_images_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.car_images_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: car_images_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.car_images_id_seq OWNED BY public.car_images.id;


--
-- Name: car_price_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.car_price_history (
    id bigint NOT NULL,
    car_id integer NOT NULL,
    old_price numeric(15,2) NOT NULL,
    new_price numeric(15,2) NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    changed_by integer
);


--
-- Name: car_price_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.car_price_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: car_price_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.car_price_history_id_seq OWNED BY public.car_price_history.id;


--
-- Name: car_specs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.car_specs (
    id integer NOT NULL,
    car_id integer NOT NULL,
    power character varying(50),
    engine character varying(100),
    drive character varying(50)
);


--
-- Name: car_specs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.car_specs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: car_specs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.car_specs_id_seq OWNED BY public.car_specs.id;


--
-- Name: car_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.car_views (
    id bigint NOT NULL,
    car_id integer NOT NULL,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL,
    viewer_id integer
);


--
-- Name: car_views_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.car_views_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: car_views_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.car_views_id_seq OWNED BY public.car_views.id;


--
-- Name: cars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cars (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    make character varying(50) NOT NULL,
    type character varying(50),
    category character varying(30),
    year integer NOT NULL,
    price numeric(15,2) NOT NULL,
    description text,
    is_available boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    condition character varying(20) DEFAULT 'New'::character varying NOT NULL,
    model character varying(100),
    mileage integer,
    color character varying(100),
    vin character varying(17),
    status character varying(30) DEFAULT 'Available'::character varying NOT NULL,
    CONSTRAINT cars_condition_check CHECK (((condition)::text = ANY (ARRAY[('New'::character varying)::text, ('Used'::character varying)::text]))),
    CONSTRAINT cars_mileage_non_negative CHECK (((mileage IS NULL) OR (mileage >= 0))),
    CONSTRAINT cars_vin_format CHECK (((vin IS NULL) OR ((vin)::text ~ '^[A-HJ-NPR-Z0-9]{17}$'::text)))
);


--
-- Name: cars_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cars_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cars_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cars_id_seq OWNED BY public.cars.id;


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id bigint NOT NULL,
    conversation_id character varying(120) NOT NULL,
    sender character varying(50) NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_message_id character varying(160),
    customer_id integer,
    car_id integer,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    retention_expires_at timestamp with time zone
);


--
-- Name: chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_messages_id_seq OWNED BY public.chat_messages.id;


--
-- Name: exchange_rate_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rate_snapshots (
    id bigint NOT NULL,
    base_currency character(3) NOT NULL,
    rates jsonb NOT NULL,
    provider character varying(80) NOT NULL,
    retrieved_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exchange_rate_expiry_after_retrieval CHECK ((expires_at > retrieved_at))
);


--
-- Name: exchange_rate_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exchange_rate_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exchange_rate_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exchange_rate_snapshots_id_seq OWNED BY public.exchange_rate_snapshots.id;


--
-- Name: favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorites (
    id integer NOT NULL,
    user_id integer NOT NULL,
    car_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: favorites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.favorites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: favorites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.favorites_id_seq OWNED BY public.favorites.id;


--
-- Name: financing_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financing_leads (
    id bigint NOT NULL,
    reference_code character varying(40) NOT NULL,
    idempotency_key character varying(128) NOT NULL,
    car_id integer NOT NULL,
    user_id integer,
    customer_name character varying(160) NOT NULL,
    customer_phone character varying(40) NOT NULL,
    customer_email character varying(254),
    vehicle_price_snapshot numeric(14,2) NOT NULL,
    down_payment numeric(14,2) NOT NULL,
    loan_amount numeric(14,2) NOT NULL,
    annual_interest_rate numeric(6,3) NOT NULL,
    loan_term_months integer NOT NULL,
    monthly_payment numeric(14,2) NOT NULL,
    total_payment numeric(14,2) NOT NULL,
    total_interest numeric(14,2) NOT NULL,
    currency character varying(3) DEFAULT 'UGX'::character varying NOT NULL,
    status character varying(16) DEFAULT 'NEW'::character varying NOT NULL,
    contact_consent boolean NOT NULL,
    consented_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_contacted_at timestamp with time zone,
    converted_at timestamp with time zone,
    admin_notes text DEFAULT ''::text NOT NULL,
    customer_whatsapp character varying(40),
    deleted_at timestamp with time zone,
    deleted_by integer,
    deletion_reason text,
    CONSTRAINT financing_leads_admin_notes_check CHECK ((char_length(admin_notes) <= 4000)),
    CONSTRAINT financing_leads_annual_interest_rate_check CHECK (((annual_interest_rate >= (0)::numeric) AND (annual_interest_rate <= (100)::numeric))),
    CONSTRAINT financing_leads_contact_consent_check CHECK ((contact_consent = true)),
    CONSTRAINT financing_leads_down_payment_check CHECK ((down_payment >= (0)::numeric)),
    CONSTRAINT financing_leads_loan_amount_check CHECK ((loan_amount > (0)::numeric)),
    CONSTRAINT financing_leads_loan_term_months_check CHECK (((loan_term_months >= 1) AND (loan_term_months <= 120))),
    CONSTRAINT financing_leads_monthly_payment_check CHECK ((monthly_payment > (0)::numeric)),
    CONSTRAINT financing_leads_status_check CHECK (((status)::text = ANY (ARRAY[('NEW'::character varying)::text, ('CONTACTED'::character varying)::text, ('QUALIFIED'::character varying)::text, ('CONVERTED'::character varying)::text, ('CLOSED'::character varying)::text]))),
    CONSTRAINT financing_leads_total_interest_check CHECK ((total_interest >= (0)::numeric)),
    CONSTRAINT financing_leads_total_payment_check CHECK ((total_payment > (0)::numeric)),
    CONSTRAINT financing_leads_vehicle_price_snapshot_check CHECK ((vehicle_price_snapshot > (0)::numeric))
);


--
-- Name: financing_leads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.financing_leads_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: financing_leads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.financing_leads_id_seq OWNED BY public.financing_leads.id;


--
-- Name: test_drives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_drives (
    id integer NOT NULL,
    user_id integer NOT NULL,
    car_id integer NOT NULL,
    preferred_date date,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    preferred_time character varying(5),
    notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp with time zone
);


--
-- Name: test_drives_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.test_drives_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: test_drives_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.test_drives_id_seq OWNED BY public.test_drives.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(100) NOT NULL,
    password text NOT NULL,
    role character varying(20) DEFAULT 'customer'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: car_images id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_images ALTER COLUMN id SET DEFAULT nextval('public.car_images_id_seq'::regclass);


--
-- Name: car_price_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_price_history ALTER COLUMN id SET DEFAULT nextval('public.car_price_history_id_seq'::regclass);


--
-- Name: car_specs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_specs ALTER COLUMN id SET DEFAULT nextval('public.car_specs_id_seq'::regclass);


--
-- Name: car_views id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_views ALTER COLUMN id SET DEFAULT nextval('public.car_views_id_seq'::regclass);


--
-- Name: cars id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cars ALTER COLUMN id SET DEFAULT nextval('public.cars_id_seq'::regclass);


--
-- Name: chat_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages ALTER COLUMN id SET DEFAULT nextval('public.chat_messages_id_seq'::regclass);


--
-- Name: exchange_rate_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rate_snapshots ALTER COLUMN id SET DEFAULT nextval('public.exchange_rate_snapshots_id_seq'::regclass);


--
-- Name: favorites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites ALTER COLUMN id SET DEFAULT nextval('public.favorites_id_seq'::regclass);


--
-- Name: financing_leads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financing_leads ALTER COLUMN id SET DEFAULT nextval('public.financing_leads_id_seq'::regclass);


--
-- Name: test_drives id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_drives ALTER COLUMN id SET DEFAULT nextval('public.test_drives_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: car_images car_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_images
    ADD CONSTRAINT car_images_pkey PRIMARY KEY (id);


--
-- Name: car_price_history car_price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_price_history
    ADD CONSTRAINT car_price_history_pkey PRIMARY KEY (id);


--
-- Name: car_specs car_specs_car_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_specs
    ADD CONSTRAINT car_specs_car_id_key UNIQUE (car_id);


--
-- Name: car_specs car_specs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_specs
    ADD CONSTRAINT car_specs_pkey PRIMARY KEY (id);


--
-- Name: car_views car_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_views
    ADD CONSTRAINT car_views_pkey PRIMARY KEY (id);


--
-- Name: cars cars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cars
    ADD CONSTRAINT cars_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: exchange_rate_snapshots exchange_rate_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rate_snapshots
    ADD CONSTRAINT exchange_rate_snapshots_pkey PRIMARY KEY (id);


--
-- Name: favorites favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_pkey PRIMARY KEY (id);


--
-- Name: financing_leads financing_leads_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financing_leads
    ADD CONSTRAINT financing_leads_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: financing_leads financing_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financing_leads
    ADD CONSTRAINT financing_leads_pkey PRIMARY KEY (id);


--
-- Name: financing_leads financing_leads_reference_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financing_leads
    ADD CONSTRAINT financing_leads_reference_code_key UNIQUE (reference_code);


--
-- Name: test_drives test_drives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_drives
    ADD CONSTRAINT test_drives_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: cars_make_model_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cars_make_model_idx ON public.cars USING btree (make, model);


--
-- Name: cars_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cars_status_idx ON public.cars USING btree (status);


--
-- Name: cars_vin_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cars_vin_unique_idx ON public.cars USING btree (vin) WHERE (vin IS NOT NULL);


--
-- Name: exchange_rate_expiry_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_rate_expiry_lookup ON public.exchange_rate_snapshots USING btree (base_currency, expires_at DESC);


--
-- Name: exchange_rate_latest_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_rate_latest_snapshot ON public.exchange_rate_snapshots USING btree (base_currency, retrieved_at DESC, id DESC);


--
-- Name: financing_leads_active_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financing_leads_active_status_created_idx ON public.financing_leads USING btree (status, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: financing_leads_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financing_leads_status_created_idx ON public.financing_leads USING btree (status, created_at DESC);


--
-- Name: idx_car_images_car_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_car_images_car_id ON public.car_images USING btree (car_id);


--
-- Name: idx_car_images_car_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_car_images_car_sort_order ON public.car_images USING btree (car_id, sort_order);


--
-- Name: idx_car_images_cloudinary_public_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_car_images_cloudinary_public_id ON public.car_images USING btree (cloudinary_public_id);


--
-- Name: idx_car_price_history_car_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_car_price_history_car_changed_at ON public.car_price_history USING btree (car_id, changed_at DESC);


--
-- Name: idx_car_views_car_viewed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_car_views_car_viewed_at ON public.car_views USING btree (car_id, viewed_at);


--
-- Name: idx_cars_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cars_created_at ON public.cars USING btree (created_at);


--
-- Name: idx_cars_make; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cars_make ON public.cars USING btree (make);


--
-- Name: idx_cars_make_model_price; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cars_make_model_price ON public.cars USING btree (make, name, price);


--
-- Name: idx_cars_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cars_model ON public.cars USING btree (name);


--
-- Name: idx_cars_price; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cars_price ON public.cars USING btree (price);


--
-- Name: idx_chat_messages_car; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_car ON public.chat_messages USING btree (car_id);


--
-- Name: idx_chat_messages_client_message_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_chat_messages_client_message_unique ON public.chat_messages USING btree (conversation_id, client_message_id);


--
-- Name: idx_chat_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_conversation ON public.chat_messages USING btree (conversation_id, created_at);


--
-- Name: idx_chat_messages_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_customer ON public.chat_messages USING btree (customer_id);


--
-- Name: idx_chat_messages_retention; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_retention ON public.chat_messages USING btree (retention_expires_at);


--
-- Name: idx_chat_messages_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_unread ON public.chat_messages USING btree (conversation_id, is_read);


--
-- Name: test_drives_active_slot_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX test_drives_active_slot_unique ON public.test_drives USING btree (car_id, preferred_date, preferred_time) WHERE ((preferred_time IS NOT NULL) AND ((status)::text <> 'cancelled'::text));


--
-- Name: test_drives_car_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX test_drives_car_date_idx ON public.test_drives USING btree (car_id, preferred_date);


--
-- Name: test_drives_user_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX test_drives_user_date_idx ON public.test_drives USING btree (user_id, preferred_date);


--
-- Name: car_images car_images_car_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_images
    ADD CONSTRAINT car_images_car_id_fkey FOREIGN KEY (car_id) REFERENCES public.cars(id) ON DELETE CASCADE;


--
-- Name: car_specs car_specs_car_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_specs
    ADD CONSTRAINT car_specs_car_id_fkey FOREIGN KEY (car_id) REFERENCES public.cars(id) ON DELETE CASCADE;


--
-- Name: favorites favorites_car_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_car_id_fkey FOREIGN KEY (car_id) REFERENCES public.cars(id) ON DELETE CASCADE;


--
-- Name: favorites favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: financing_leads financing_leads_car_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financing_leads
    ADD CONSTRAINT financing_leads_car_id_fkey FOREIGN KEY (car_id) REFERENCES public.cars(id) ON DELETE RESTRICT;


--
-- Name: financing_leads financing_leads_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financing_leads
    ADD CONSTRAINT financing_leads_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: financing_leads financing_leads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financing_leads
    ADD CONSTRAINT financing_leads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: car_price_history fk_car_price_history_car; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_price_history
    ADD CONSTRAINT fk_car_price_history_car FOREIGN KEY (car_id) REFERENCES public.cars(id) ON DELETE CASCADE;


--
-- Name: car_price_history fk_car_price_history_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_price_history
    ADD CONSTRAINT fk_car_price_history_user FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: car_views fk_car_views_car; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_views
    ADD CONSTRAINT fk_car_views_car FOREIGN KEY (car_id) REFERENCES public.cars(id) ON DELETE CASCADE;


--
-- Name: car_views fk_car_views_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_views
    ADD CONSTRAINT fk_car_views_user FOREIGN KEY (viewer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chat_messages fk_chat_messages_car; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT fk_chat_messages_car FOREIGN KEY (car_id) REFERENCES public.cars(id) ON DELETE SET NULL;


--
-- Name: chat_messages fk_chat_messages_customer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT fk_chat_messages_customer FOREIGN KEY (customer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: test_drives test_drives_car_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_drives
    ADD CONSTRAINT test_drives_car_id_fkey FOREIGN KEY (car_id) REFERENCES public.cars(id) ON DELETE CASCADE;


--
-- Name: test_drives test_drives_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_drives
    ADD CONSTRAINT test_drives_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict yU1dK1dKG2kiRrAfcxaoGbwf0G7N6Buj3pIEzL1H6USgXLSZAeLXiums3gG6aNm

