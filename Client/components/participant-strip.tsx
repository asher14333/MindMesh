"use client"

const participants = [
  { 
    name: "Sarah", 
    speaking: true,
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=80&fit=crop&crop=face"
  },
  { 
    name: "Marcus", 
    speaking: false,
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=80&fit=crop&crop=face"
  },
  { 
    name: "Elena", 
    speaking: false,
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=80&fit=crop&crop=face"
  },
  { 
    name: "David", 
    speaking: false,
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=80&fit=crop&crop=face"
  },
  { 
    name: "Rachel", 
    speaking: false,
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=80&fit=crop&crop=face"
  },
]

const allParticipants = [
  { 
    name: "You", 
    speaking: false,
    image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=140&fit=crop&crop=face"
  },
  ...participants
]

export default function ParticipantStrip() {
  return (
    <div className="shrink-0 border-b border-border/40 bg-muted/30 px-4 py-3 md:px-6">
      <div className="flex items-center justify-center gap-3 md:gap-4">
        {allParticipants.map((participant) => (
          <div 
            key={participant.name} 
            className="relative flex flex-col items-center gap-1"
          >
            <div 
              className={`
                relative h-24 w-36 overflow-hidden rounded-xl bg-slate-800
                ${participant.speaking 
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-muted/30" 
                  : "ring-1 ring-border/40"
                }
              `}
            >
              <img
                src={participant.image}
                alt={participant.name}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/60 to-transparent" />
              <span className="absolute bottom-1 left-2 text-[10px] font-medium text-white/90">
                {participant.name}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
