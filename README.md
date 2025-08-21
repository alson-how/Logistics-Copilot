# Logistics Copilot

An intelligent assistant for logistics and customs documentation, powered by RAG (Retrieval-Augmented Generation) and workflow automation.

## 🌟 Features

- **Smart Document Search**: Uses vector embeddings to find relevant information from customs and logistics documents
- **Interactive Workflows**: Guided processes for export/import procedures
- **Form Management**: Easy access to Malaysian Customs forms (K1, K2, K3, K8, K9)
- **Intelligent Chat**: Context-aware responses using OpenAI's GPT models
- **Document Processing**: Supports multiple formats (PDF, HTML, Markdown)

## 🛠 Tech Stack

- **Backend**: Node.js/TypeScript with Express
- **Database**: PostgreSQL with pgvector for vector similarity search
- **Frontend**: React with TypeScript
- **AI/ML**: OpenAI API (GPT-3.5 Turbo, text-embedding-3-small)
- **Containerization**: Docker & Docker Compose

## 📋 Prerequisites

- Docker and Docker Compose
- Node.js (v20 or later)
- OpenAI API key
- Git

## 🚀 Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/alson-how/Logistics-Copilot.git
   cd Logistics-Copilot
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the services**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   - Web Interface: http://localhost:5173
   - API: http://localhost:8080

## 📁 Project Structure

```
.
├── server/                 # Backend API service
│   ├── src/               # Source code
│   ├── workflows/         # Workflow definitions
│   └── Dockerfile        
├── client/                # Frontend React application
│   ├── src/              
│   └── Dockerfile
├── knowledge/             # Knowledge base documents
├── assets/               # Static assets
│   └── forms/            # Customs forms
└── db/                    # Database initialization scripts
```

## 🔄 Workflows

The system supports guided workflows for various logistics processes:

- Export procedures
- Import procedures
- Customs documentation
- Permit applications
- Strategic trade controls

## 📚 Knowledge Base

The system maintains a vector database of:
- Customs procedures
- Import/Export guidelines
- Forms and documentation
- Regulations and compliance
- Strategic trade controls

## 🛡 Security

- Environment variables for sensitive data
- Docker volume for persistent data
- Secure API endpoints
- Form validation and sanitization

## 🔧 Configuration

Key configuration options in `.env`:

```env
# Database
POSTGRES_USER=your_username
POSTGRES_PASSWORD=your_password
POSTGRES_DB=your_database_name

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Application
NODE_ENV=development
PORT=8080
RAG_TOP_K=6
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- OpenAI for GPT and Embeddings API
- Pgvector for vector similarity search
- Malaysian Customs for documentation and guidelines