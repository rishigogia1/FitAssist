# 🏋️‍♂️ FitAssist — AI-Powered Smart Fitness & Nutrition Copilot

FitAssist is an end-to-end intelligent fitness application combining real-time computer vision, personalized AI coaching, tailored workout routines, comprehensive nutrition tracking, and health metrics analytics into a single cohesive platform.

---

## 🌟 Key Features

### 1. 🤖 AI Fitness & Nutrition Coach
- **Conversational Intelligence**: Powered by **Google Gemini** with structured prompt engineering and conversational memory.
- **Intent Classification**: Automatically detects user query intent (e.g., `POST_WORKOUT_MEAL`, `EXERCISE_FORM`, `WORKOUT_PLAN`, `CALORIES`, `PROGRESS_ANALYSIS`) to provide targeted advice.
- **Context-Aware Recommendations**: Integrates user profile data (height, weight, goals, dietary restrictions) directly into coaching feedback.

### 2. 📹 Real-Time Pose Estimation & Form Analysis
- **Edge Computer Vision**: In-browser pose tracking utilizing **MediaPipe Vision** (`@mediapipe/tasks-vision`) without streaming video to servers (100% privacy preserving).
- **Exercise Biomechanics**: Real-time angle calculation, rep counting, and form deviance detection (e.g., squat depth, knee valgus, torso forward lean).
- **PDF Report Generation**: Instant export of workout analysis reports with biomechanical stats via `jspdf` and `jspdf-autotable`.

### 3. 📅 Workout Scheduling & Live Session Tracking
- **Smart Program Generator**: Dynamic workout splits based on user fitness level (Beginner, Intermediate, Advanced) and goal (Muscle Gain, Fat Loss, Endurance, Mobility).
- **Interactive Calendar**: Schedule and track planned training days versus active rest days.
- **Live Session Tracker**: Log sets, reps, weight, duration, and completion status in real-time.

### 4. 🥗 Nutrition & Macro Tracker
- **Meal Logging**: Track breakfast, lunch, dinner, and snacks with automated calorie and macronutrient (protein, carbs, fats) aggregation.
- **AI Daily Meal Planner**: Generates targeted meal suggestions matching caloric targets and dietary preferences.
- **Nutrition Insights & Feedback**: Automated feedback on dietary adherence, micronutrients, and meal distribution.

### 5. 👟 Daily Step Tracking & Goal Setting
- **Persistent Storage**: Dedicated database models (`daily_step_logs`) storing user step counts, daily goals, and data source.
- **Dynamic & Historical Targets**: Preserves past daily targets when goals are updated over time.
- **Integrity Constraints**: Multi-level database and schema validation ensuring non-negative counts and positive goals with unique date-user indexing.

### 6. 📈 Progress Analytics & Gamification
- **Weight Tracking**: Visual trend lines and historical body composition monitoring.
- **Gamified Achievements**: Unlock milestone badges for workout consistency, personal bests, and streak milestones.
- **Unified Health Dashboard**: Centralized view of weekly adherence, today's targets, and quick actions.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, TanStack Router / TanStack Start, Vite, Tailwind CSS v4, Radix UI Primitives, Lucide Icons, Recharts |
| **Computer Vision** | Google MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) |
| **Backend API** | FastAPI (Python 3.10+), Pydantic v2, Uvicorn |
| **Database & ORM** | PostgreSQL, SQLAlchemy 2.0, Alembic (Migrations) |
| **Authentication** | JWT Authentication (`python-jose`, Cryptography), Email OTP Verification (`nodemailer` / SMTP) |
| **AI / LLM** | Google Gemini API (`google-generativeai`) |
| **ML Pipeline** | PyTorch (Temporal 1D-CNN pipeline for multi-frame exercise deviance classification) |

---

## 📂 Project Directory Structure

```text
precision-fit-app-main/
├── backend/                         # FastAPI Python Backend
│   ├── alembic/                     # Alembic database migration scripts
│   │   ├── versions/                # Schema migration revisions
│   │   └── env.py                   # Alembic environment configuration
│   ├── app/
│   │   ├── api/routes/              # REST API endpoints (auth, dashboard, coach, etc.)
│   │   ├── auth/                    # JWT handling & dependency injection
│   │   ├── database/                # Database connection and Base metadata
│   │   ├── models/                  # SQLAlchemy ORM models
│   │   ├── schemas/                 # Pydantic validation schemas
│   │   ├── services/                # Business logic (AI Coach, Nutrition, SLM)
│   │   ├── config.py                # App configuration & settings
│   │   └── main.py                  # FastAPI application entrypoint
│   ├── requirements.txt             # Python backend dependencies
│   └── test_*.py                    # Backend test suites (unit & integration)
│
├── src/                             # React / Vite Frontend
│   ├── components/                  # Reusable UI components (Radix + Tailwind)
│   ├── features/                    # Feature modules (pose estimation, reports)
│   ├── hooks/                       # Custom React hooks
│   ├── lib/                         # API clients, context providers, utility functions
│   ├── routes/                      # File-based routing (TanStack Router)
│   │   ├── ai-coach.tsx             # Interactive Gemini Coach chat
│   │   ├── dashboard.tsx            # Main user dashboard
│   │   ├── nutrition.tsx            # Nutrition & meal tracking
│   │   ├── progress.tsx             # Weight & analytics charts
│   │   ├── settings.tsx             # User profile & target preferences
│   │   └── workout/                 # Live workout & pose tracker
│   └── styles.css                   # Global styles & Tailwind configuration
│
├── ml/                              # Machine Learning Pipeline
│   ├── scripts/                     # Dataset validation and CNN training scripts
│   └── README.md                    # Temporal CNN feature specification & guide
│
├── package.json                     # Frontend dependencies & npm scripts
├── vite.config.ts                   # Vite bundler configuration
└── .env.example                     # Environment variables template
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your machine:
- **Node.js** (v18.x or later) & **npm** (v10.x or later)
- **Python** (v3.10 to v3.13)
- **PostgreSQL** (v14 or later) running locally or remotely

---

### Step 1: Environment Configuration

Create a `.env` file in the project root by copying `.env.example`:

```bash
cp .env.example .env
```

Configure the following variables in `.env`:

```env
# ─── SMTP (Email OTP Verification) ──────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_FROM=FitAssist <your_email@gmail.com>

# ─── AI (Google Gemini) ─────────────────────────────────────
GEMINI_API_KEY=your_gemini_api_key_here
```

Configure your PostgreSQL database URL in `backend/app/config.py` or `.env`:
```text
DATABASE_URL=postgresql+psycopg2://postgres:<password>@localhost:5432/fitassist
```

---

### Step 2: Backend Setup & Migrations

1. Open a terminal and enter the `backend` directory:
   ```powershell
   cd backend
   ```

2. Activate the Python virtual environment:
   - **Windows (PowerShell)**:
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   - **Linux / macOS**:
     ```bash
     source venv/bin/activate
     ```

   *(If creating a new virtual environment, run `python -m venv venv` and `pip install -r requirements.txt`)*

3. Run database migrations to bring your PostgreSQL schema up to date:
   ```powershell
   alembic upgrade head
   ```

4. Launch the FastAPI server:
   ```powershell
   python -m uvicorn app.main:app --reload --port 8000
   ```
   - **API URL**: `http://localhost:8000`
   - **Swagger Docs**: `http://localhost:8000/docs`

---

### Step 3: Frontend Setup

1. Open a second terminal in the project root:
   ```powershell
   cd "precision-fit-app-main"
   ```

2. Install dependencies (if not already installed):
   ```powershell
   npm install
   ```

3. Start the development server:
   ```powershell
   npm run dev
   ```
   - **Application URL**: `http://localhost:5173` (or port specified in terminal)

---

## 🧪 Testing

### Backend Unit & Regression Tests

Run backend tests using Python's built-in `unittest` runner:

```powershell
cd backend

# Daily Step Log Model & Migration verification
.\venv\Scripts\python -m unittest test_daily_step_log_model.py

# Scheduled Workouts tests
.\venv\Scripts\python -m unittest test_scheduled_workout_model.py

# Workout Sessions unit tests
.\venv\Scripts\python -m unittest test_workout_sessions_unit.py

# AI Coach intent detection tests
.\venv\Scripts\python test_coach.py
```

### Frontend Code Quality

```powershell
# Run ESLint
npm run lint

# Format code with Prettier
npm run format
```

---

## 🔒 Privacy & Security

- **Edge Computer Vision**: Video frames captured by your webcam are analyzed strictly inside your browser using WebAssembly and WebGL. No raw camera images or videos are transmitted to any server.
- **Authentication**: Stateless, cryptographically signed JSON Web Tokens (JWT) using HS256 algorithm with configurable expiration.

---

## 📄 License

This project is built for educational, academic, and development purposes.
