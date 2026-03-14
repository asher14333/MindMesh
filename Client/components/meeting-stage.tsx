"use client"

const participants = [
  { 
    name: "Sarah Chen", 
    image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=300&fit=crop&crop=face",
    speaking: true
  },
  { 
    name: "Marcus Johnson", 
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=150&fit=crop&crop=face"
  },
  { 
    name: "Elena Rodriguez", 
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=150&fit=crop&crop=face"
  },
  { 
    name: "David Kim", 
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=150&fit=crop&crop=face"
  },
  { 
    name: "You", 
    image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=150&fit=crop&crop=face"
  },
]

export default function MeetingStage() {
  const activeSpeaker = participants[0]
  const otherParticipants = participants.slice(1)

  return (
    <div className="flex h-full gap-4 p-4 md:gap-6 md:p-6">
      {/* Main speaker stage */}
      <div className="flex flex-1 items-center justify-center">
        <div className="relative aspect-video w-full max-w-4xl overflow-hidden rounded-2xl bg-slate-800 ring-1 ring-border/30">
          <img
            src={activeSpeaker.image}
            alt={activeSpeaker.name}
            className="h-full w-full object-cover"
          />
          {/* Gradient overlay for name */}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
          {/* Speaker name tag */}
          <div className="absolute bottom-4 left-4 flex items-center gap-2">
            <span className="rounded-md bg-black/40 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
              {activeSpeaker.name}
            </span>
            {activeSpeaker.speaking && (
              <div className="flex items-center gap-1.5 rounded-md bg-accent/90 px-2 py-1 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                <span className="text-xs font-medium text-white">Speaking</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right participant rail */}
      <div className="hidden w-44 shrink-0 flex-col gap-3 lg:flex xl:w-52">
        {otherParticipants.map((participant) => (
          <div 
            key={participant.name}
            className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-800 ring-1 ring-border/30"
          >
            <img
              src={participant.image}
              alt={participant.name}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/50 to-transparent" />
            <span className="absolute bottom-1.5 left-2 text-[10px] font-medium text-white/90">
              {participant.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
