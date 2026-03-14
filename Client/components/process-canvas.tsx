"use client"

// Process flow node types and status
type NodeStatus = "done" | "active" | "blocked" | "waiting"

interface ProcessNode {
  id: string
  title: string
  lane: number
  status: NodeStatus
  description?: string
}

const lanes = [
  "Sales",
  "Solutions Engineering",
  "Security",
  "Legal",
  "Customer Success"
]

const nodes: ProcessNode[] = [
  { id: "1", title: "Sales Handoff", lane: 0, status: "done", description: "Deal closed, customer qualified" },
  { id: "2", title: "Scope Definition", lane: 1, status: "done", description: "Technical requirements documented" },
  { id: "3", title: "Security Review", lane: 2, status: "blocked", description: "Compliance audit pending" },
  { id: "4", title: "Legal Approval", lane: 3, status: "waiting", description: "Awaiting security sign-off" },
  { id: "5", title: "Provisioning", lane: 3, status: "waiting", description: "Environment setup queued" },
  { id: "6", title: "Customer Onboard", lane: 4, status: "waiting", description: "Welcome & training scheduled" },
]

const statusStyles: Record<NodeStatus, { bg: string; border: string; text: string; badge: string }> = {
  done: { 
    bg: "bg-emerald-50", 
    border: "border-emerald-200", 
    text: "text-emerald-700",
    badge: "Done"
  },
  active: { 
    bg: "bg-sky-50", 
    border: "border-sky-200", 
    text: "text-sky-700",
    badge: "Active"
  },
  blocked: { 
    bg: "bg-amber-50", 
    border: "border-amber-300", 
    text: "text-amber-700",
    badge: "Blocked"
  },
  waiting: { 
    bg: "bg-slate-50", 
    border: "border-slate-200", 
    text: "text-slate-500",
    badge: "Waiting"
  },
}

function StatusBadge({ status }: { status: NodeStatus }) {
  const style = statusStyles[status]
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
      {style.badge}
    </span>
  )
}

function ProcessNodeCard({ node }: { node: ProcessNode }) {
  const style = statusStyles[node.status]
  const isBlocked = node.status === "blocked"
  
  return (
    <div 
      className={`group relative rounded-lg border ${style.border} ${style.bg} p-3 transition-all ${
        isBlocked ? "ring-1 ring-amber-300/50" : ""
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">{node.title}</h3>
        <StatusBadge status={node.status} />
      </div>
      {node.description && (
        <p className="text-xs text-muted-foreground leading-relaxed">{node.description}</p>
      )}
    </div>
  )
}

function Connector({ from, to, isAmbiguous = false }: { from: number; to: number; isAmbiguous?: boolean }) {
  const fromY = from * 140 + 70
  const toY = to * 140 + 70
  const startX = 180
  const endX = 280
  
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 h-full w-full"
      style={{ zIndex: 0 }}
    >
      <defs>
        <marker
          id={`arrow-${from}-${to}`}
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
        >
          <path 
            d="M0,0 L8,4 L0,8" 
            fill="none" 
            stroke={isAmbiguous ? "#f59e0b" : "#94a3b8"} 
            strokeWidth="1.5"
          />
        </marker>
      </defs>
      <path
        d={`M${startX},${fromY} C${startX + 50},${fromY} ${endX - 50},${toY} ${endX},${toY}`}
        fill="none"
        stroke={isAmbiguous ? "#f59e0b" : "#cbd5e1"}
        strokeWidth={isAmbiguous ? "2" : "1.5"}
        strokeDasharray={isAmbiguous ? "4 3" : "none"}
        markerEnd={`url(#arrow-${from}-${to})`}
      />
    </svg>
  )
}

export default function ProcessCanvas() {
  return (
    <div className="relative h-full w-full overflow-auto">
      {/* Blueprint grid background */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(circle, #cbd5e1 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
          backgroundPosition: '12px 12px'
        }}
      />
      
      {/* Canvas content */}
      <div className="relative min-h-full min-w-[900px] p-6 md:p-8 lg:p-10">
        {/* Insight chip */}
        <div className="absolute right-6 top-6 z-20 md:right-8 md:top-8">
          <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className="text-xs font-medium text-amber-700">
              Security review is slowing downstream approval
            </span>
          </div>
        </div>

        {/* Swim lanes container */}
        <div className="relative">
          {/* Lane headers */}
          <div className="mb-6 flex gap-4 border-b border-dashed border-slate-300/70 pb-4">
            {lanes.map((lane, index) => (
              <div 
                key={lane} 
                className="flex-1 min-w-[160px]"
              >
                <span className={`text-xs font-semibold uppercase tracking-wider ${
                  index === 2 ? "text-amber-600" : "text-muted-foreground"
                }`}>
                  {lane}
                </span>
              </div>
            ))}
          </div>

          {/* Flow visualization */}
          <div className="relative" style={{ height: '460px' }}>
            {/* Vertical lane dividers */}
            {lanes.slice(0, -1).map((_, index) => (
              <div
                key={index}
                className="absolute top-0 h-full w-px border-l border-dashed border-slate-200"
                style={{ left: `${((index + 1) / lanes.length) * 100}%` }}
              />
            ))}

            {/* Nodes positioned in their lanes */}
            <div className="relative h-full">
              {/* Sales Handoff - Lane 0 */}
              <div className="absolute" style={{ left: '0%', top: '20px', width: 'calc(20% - 16px)' }}>
                <ProcessNodeCard node={nodes[0]} />
              </div>
              
              {/* Arrow from Sales to Solutions */}
              <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 1 }}>
                <defs>
                  <marker id="arrow-1" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L8,3 L0,6" fill="none" stroke="#94a3b8" strokeWidth="1" />
                  </marker>
                </defs>
                <path
                  d="M calc(20% - 16px) 60 L 20% 60 L 20% 140 L calc(20% + 8px) 140"
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="1.5"
                  markerEnd="url(#arrow-1)"
                />
              </svg>

              {/* Scope Definition - Lane 1 */}
              <div className="absolute" style={{ left: '20%', top: '120px', width: 'calc(20% - 16px)', marginLeft: '8px' }}>
                <ProcessNodeCard node={nodes[1]} />
              </div>

              {/* Arrow from Solutions to Security */}
              <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 1 }}>
                <defs>
                  <marker id="arrow-2" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L8,3 L0,6" fill="none" stroke="#94a3b8" strokeWidth="1" />
                  </marker>
                </defs>
                <path
                  d="M calc(40% - 8px) 180 L 40% 180 L 40% 260 L calc(40% + 8px) 260"
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="1.5"
                  markerEnd="url(#arrow-2)"
                />
              </svg>

              {/* Security Review - Lane 2 (Blocked/Bottleneck) */}
              <div className="absolute" style={{ left: '40%', top: '240px', width: 'calc(20% - 16px)', marginLeft: '8px' }}>
                <div className="relative">
                  <div className="absolute -inset-2 animate-pulse rounded-xl bg-amber-200/30" />
                  <ProcessNodeCard node={nodes[2]} />
                </div>
              </div>

              {/* Ambiguous arrow from Security to Legal */}
              <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 1 }}>
                <defs>
                  <marker id="arrow-3" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L8,3 L0,6" fill="none" stroke="#f59e0b" strokeWidth="1" />
                  </marker>
                </defs>
                <path
                  d="M calc(60% - 8px) 300 L 60% 300 L 60% 140 L calc(60% + 8px) 140"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  markerEnd="url(#arrow-3)"
                />
              </svg>

              {/* Legal Approval - Lane 3 */}
              <div className="absolute" style={{ left: '60%', top: '120px', width: 'calc(20% - 16px)', marginLeft: '8px' }}>
                <ProcessNodeCard node={nodes[3]} />
              </div>

              {/* Arrow from Legal to Provisioning */}
              <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 1 }}>
                <defs>
                  <marker id="arrow-4" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L8,3 L0,6" fill="none" stroke="#94a3b8" strokeWidth="1" />
                  </marker>
                </defs>
                <path
                  d="M calc(68%) 200 L calc(68%) 240"
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="1.5"
                  markerEnd="url(#arrow-4)"
                />
              </svg>

              {/* Provisioning - Lane 3 (below Legal) */}
              <div className="absolute" style={{ left: '60%', top: '260px', width: 'calc(20% - 16px)', marginLeft: '8px' }}>
                <ProcessNodeCard node={nodes[4]} />
              </div>

              {/* Arrow from Provisioning to Customer Success */}
              <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 1 }}>
                <defs>
                  <marker id="arrow-5" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L8,3 L0,6" fill="none" stroke="#94a3b8" strokeWidth="1" />
                  </marker>
                </defs>
                <path
                  d="M calc(80% - 8px) 320 L 80% 320 L 80% 400 L calc(80% + 8px) 400"
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="1.5"
                  markerEnd="url(#arrow-5)"
                />
              </svg>

              {/* Customer Onboard - Lane 4 */}
              <div className="absolute" style={{ left: '80%', top: '380px', width: 'calc(20% - 16px)', marginLeft: '8px' }}>
                <ProcessNodeCard node={nodes[5]} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
