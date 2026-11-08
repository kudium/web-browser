/** Editable starting points; choosing a preset never saves or executes it. */
export const scriptCommandPresets = [
  {
    language: 'Node.js',
    commands: [
      ['Development server', 'npm run dev'],
      ['Start', 'npm start'],
      ['Tests', 'npm test'],
      ['Build', 'npm run build'],
      ['Install dependencies', 'npm install'],
      ['pnpm development server', 'pnpm dev'],
      ['pnpm install', 'pnpm install'],
      ['Yarn development server', 'yarn dev'],
    ],
  },
  {
    language: 'Bun',
    commands: [
      ['Development server', 'bun run dev'],
      ['Tests', 'bun test'],
      ['Build', 'bun run build'],
      ['Install dependencies', 'bun install'],
    ],
  },
  {
    language: 'Python',
    commands: [
      ['HTTP server', 'python3 -m http.server 8000'],
      ['Tests with pytest', 'python3 -m pytest'],
      ['Virtual environment', 'python3 -m venv .venv'],
      ['Install requirements', 'python3 -m pip install -r requirements.txt'],
      ['Flask development server', 'flask --app app run --debug'],
    ],
  },
  {
    language: 'PHP',
    commands: [
      ['Development server', 'php -S localhost:8000'],
      ['Laravel server', 'php artisan serve'],
      ['Laravel tests', 'php artisan test'],
      ['Install dependencies', 'composer install'],
    ],
  },
  {
    language: 'Rust',
    commands: [
      ['Run', 'cargo run'],
      ['Tests', 'cargo test'],
      ['Build', 'cargo build'],
      ['Check', 'cargo check'],
      ['Format', 'cargo fmt'],
    ],
  },
  {
    language: 'Go',
    commands: [
      ['Run', 'go run .'],
      ['Tests', 'go test ./...'],
      ['Build', 'go build ./...'],
      ['Install dependencies', 'go mod download'],
    ],
  },
  {
    language: 'Ruby',
    commands: [
      ['Rails server', 'bundle exec rails server'],
      ['Rails tests', 'bundle exec rails test'],
      ['Install dependencies', 'bundle install'],
    ],
  },
  {
    language: 'Java / Kotlin',
    commands: [
      ['Gradle development server', './gradlew bootRun'],
      ['Gradle tests', './gradlew test'],
      ['Maven development server', 'mvn spring-boot:run'],
      ['Maven tests', 'mvn test'],
    ],
  },
  {
    language: '.NET',
    commands: [
      ['Development server', 'dotnet watch run'],
      ['Tests', 'dotnet test'],
      ['Build', 'dotnet build'],
      ['Restore dependencies', 'dotnet restore'],
    ],
  },
  {
    language: 'C / C++',
    commands: [
      ['Configure CMake', 'cmake -S . -B build'],
      ['Build', 'cmake --build build'],
      ['Tests', 'ctest --test-dir build'],
      ['Make', 'make'],
    ],
  },
  {
    language: 'Docker',
    commands: [
      ['Start services', 'docker compose up --build'],
      ['Stop services', 'docker compose down'],
      ['Logs', 'docker compose logs -f'],
    ],
  },
] as const;
