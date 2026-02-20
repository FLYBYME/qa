# AI-Powered Hyper-Personalized Survey System

A modern, full-stack survey application that uses AI to generate dynamic questions based on user-selected topics, provides deep analysis, and allows for follow-up interactions via chat.

## 🌟 Features

- **Dynamic Question Generation**: AI crafts unique questions based on any topic you provide.
- **Intelligent Summary & Insights**: Automated analysis of your responses with actionable recommendations.
- **Answer Review**: Full transparency into your survey session with a dedicated review screen.
- **Interactive AI Chat**: Converse with an AI that has full context of your survey topic, answers, and analysis.
- **Deep Linking & Persistence**: Every survey is unique and saved. Use URL hashes (e.g., `#id=uuid`) to return to or share specific sessions.
- **History Browser**: Easily browse and resume past survey sessions.
- **Modern Glassmorphism UI**: A premium, responsive dark-mode interface with smooth animations and transitions.

## 🛠️ Tech Stack

- **Backend**: Node.js, [tool-ms](https://github.com/FLYBYME/tool-ms) (Service Micro-framework), Zod (Schema Validation).
- **Frontend**: TypeScript, Webpack, Vanilla CSS (Custom Design System).
- **Data Store**: Local JSON-based persistence (`data/surveys.json`).
- **LLM Integration**: Supports Ollama, OpenAI, Gemini, and Anthropic.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Ollama](https://ollama.com/) (for local LLM) or an API key for OpenAI/Gemini/Anthropic.

### Installation

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd qa
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment**:
    Create a `.env` file based on [.env.example](.env.example):
    ```bash
    cp .env.example .env
    ```

### Running the Application

1.  **Start the Backend**:
    ```bash
    npm run main
    ```

2.  **Start the Frontend (Dev Server)**:
    ```bash
    npm run start
    ```
    The application will be available at `http://localhost:8080`.

## 📂 Project Structure

- `src/main.ts`: Backend entry point and service registration.
- `src/actions/`: Backend service actions (Survey generation, Chat, Analysis).
- `src/store/`: Data persistence layer.
- `src/cleint/`: Frontend application code.
  - `index.ts`: Application logic and state management.
  - `css/main.css`: Custom design system and components.
- `data/`: Local storage for survey sessions.

## 📝 License

Distributed under the MIT License.
