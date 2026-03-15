# MindMesh Local Demo

## Setup

1. Create `backend/.env`:

```env
MINDMESH_ALLOWED_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
MINDMESH_LLM_API_KEY=your_api_key_here
MINDMESH_LLM_MODEL=gpt-5-mini
```

2. Create `client/.env.local`:

```env
NEXT_PUBLIC_MINDMESH_WS_URL=ws://localhost:8000
NEXT_PUBLIC_MINDMESH_DEBUG=1
```#
## Run

1. Start the backend:

```bash
cd backend
uvicorn app.main:app --reload
```

2. Start the frontend:

```bash
cd client
npm run dev
```

3. Open `http://localhost:3000` in Chrome or Edge.
4. Allow camera and microphone access.
5. Join the meeting and click `Turn On MindMesh`.

## Live Speech Demo

Speak these lines in order:

1. `First sales hands off the deal to solutions engineering.`
2. `Then security reviews the integration requirements.`
3. `After security sign-off, legal approves the MSA.`
4. `Finally provisioning starts and customer success is notified.`

Expected result:

- transcript events appear in the browser console
- the first diagram arrives as `diagram.replace`
- later updates arrive as `diagram.patch`
- the version number in the UI increments over time

## Debug Shortcut

If `NEXT_PUBLIC_MINDMESH_DEBUG=1` is set, use the debug panel in the canvas:

- `Run Demo Script` sends the four onboarding lines through the real backend session
- `Reset Diagram` sends `diagram.reset`

## Multi-Tab Check

1. Open a second tab at `http://localhost:3000`.
2. Join the same meeting.
3. Speak in either tab.

Expected result:

- both tabs stay in the same MindMesh session
- both canvases converge on the same diagram updates
