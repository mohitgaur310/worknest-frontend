# Worknest frontend

React app scaffolded with Vite (JavaScript). Visitors sign in against the Worknest API. After sign-in, the page shows the current user's name, email, and role, then the projects they can see. Admins and managers can create a project. A project page lists members and tasks. Tasks can be shown as a list or as a board with To do, In progress, and Done columns. A task page edits the task, comments, and activity. People opens the employee directory. HR and admins keep profiles, upload payslips, and admins still create sign-in accounts. Leave requests and payslip downloads follow the signed-in person's role.

## Install

```bash
cp .env.example .env
npm install
```

## Start

```bash
npm run dev
```

Open the URL Vite prints (usually [http://localhost:5173](http://localhost:5173)).

`VITE_API_URL` defaults to `http://localhost:4000`. Start the backend so sign-in can reach the API. Requests send cookies with `credentials: 'include'`.
# worknest-frontend
# worknest-frontend
