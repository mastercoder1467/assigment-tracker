import React, { useEffect, useMemo, useRef, useState } from "react";

type Status = "Open" | "Done";

type Assignment = {
  id: string;
  title: string;
  course: string;
  dueDate: string;
  dueTime: string;
  status: Status;
  notes: string;
  createdAt: string;
  completedAt?: string;
};

type SortKey = "due" | "created";

type Course = {
  id: string;
  name: string;
  meetingDays: string[];
  meetingStartTime: string;
  meetingEndTime: string;
};

type CalendarEvent = {
  id: string;
  title: string;
  courseId: string;
  date: string;
  time: string;
  notes: string;
  createdAt: string;
};

type SchoolOverride = {
  id: string;
  date: string;
  kind: "no_school" | "day_schedule";
  dayOfWeek?: string;
  label?: string;
};

const STORAGE_KEY = "assignment-tracker.v1";
const CLASS_KEY = "assignment-tracker.classes.v1";
const EVENT_KEY = "assignment-tracker.events.v1";
const OVERRIDE_KEY = "assignment-tracker.overrides.v1";

const todayStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
};

const parseDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).getTime();
};

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const formatDate = (value: string) => {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
};

const formatTime = (value: string) => {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
};

const formatDueDateTime = (assignment: Assignment) => {
  const formattedDate = formatDate(assignment.dueDate);
  if (!assignment.dueTime) return formattedDate;
  return `${formattedDate} ${formatTime(assignment.dueTime)}`;
};

const formatEventDateTime = (event: CalendarEvent) => {
  const formattedDate = formatDate(event.date);
  const formattedTime = formatTime(event.time);
  if (!formattedTime) return formattedDate;
  return `${formattedDate} ${formattedTime}`;
};

const formatTimeRange = (start: string, end: string) => {
  if (!start && !end) return "";
  if (start && !end) return formatTime(start);
  if (!start && end) return formatTime(end);
  return `${formatTime(start)} – ${formatTime(end)}`;
};

const timeToMinutes = (value: string) => {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const minutesToTime = (minutes: number) => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};
const isOverdue = (assignment: Assignment) => {
  if (assignment.status === "Done") return false;
  return parseDate(assignment.dueDate) < todayStart();
};

const daysOverdue = (assignment: Assignment) => {
  if (!isOverdue(assignment)) return 0;
  const diff = todayStart() - parseDate(assignment.dueDate);
  return Math.max(1, Math.floor(diff / (24 * 60 * 60 * 1000)));
};

const isDueSoon = (assignment: Assignment, days = 7) => {
  if (assignment.status === "Done") return false;
  const delta = parseDate(assignment.dueDate) - todayStart();
  return delta >= 0 && delta <= days * 24 * 60 * 60 * 1000;
};

const loadAssignments = (): Assignment[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Assignment[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && item.id && item.title && item.dueDate);
  } catch {
    return [];
  }
};

const persistAssignments = (assignments: Assignment[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
};

const loadClasses = (): Course[] => {
  const raw = localStorage.getItem(CLASS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Course[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && item.id && item.name);
  } catch {
    return [];
  }
};

const persistClasses = (classes: Course[]) => {
  localStorage.setItem(CLASS_KEY, JSON.stringify(classes));
};

const loadEvents = (): CalendarEvent[] => {
  const raw = localStorage.getItem(EVENT_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CalendarEvent[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && item.id && item.title && item.date);
  } catch {
    return [];
  }
};

const persistEvents = (events: CalendarEvent[]) => {
  localStorage.setItem(EVENT_KEY, JSON.stringify(events));
};

const loadOverrides = (): SchoolOverride[] => {
  const raw = localStorage.getItem(OVERRIDE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SchoolOverride[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && item.id && item.date && item.kind);
  } catch {
    return [];
  }
};

const persistOverrides = (overrides: SchoolOverride[]) => {
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
};

const mergeClasses = (classes: Course[], assignments: Assignment[]) => {
  const byName = new Map<string, Course>();
  classes.forEach((item) =>
    byName.set(item.name, {
      ...item,
      meetingDays: Array.isArray(item.meetingDays) ? item.meetingDays : [],
      meetingStartTime: item.meetingStartTime ?? "",
      meetingEndTime: item.meetingEndTime ?? ""
    })
  );
  assignments.forEach((item) => {
    if (!byName.has(item.course)) {
      byName.set(item.course, {
        id: crypto.randomUUID(),
        name: item.course,
        meetingDays: [],
        meetingStartTime: "",
        meetingEndTime: ""
      });
    }
  });
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const sortDays = (days: string[]) => {
  const order = new Map(DAYS.map((day, index) => [day, index]));
  return [...days].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
};

const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const monthEnd = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

const toISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dayIndex = (date: Date) => {
  const jsDay = date.getDay(); // 0 = Sun
  return jsDay === 0 ? 6 : jsDay - 1; // 0 = Mon
};

const emptyForm = {
  title: "",
  course: "",
  dueDate: "",
  dueTime: "",
  notes: ""
};

export default function App() {
  const initialAssignments = loadAssignments();
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments);
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [query, setQuery] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [classes, setClasses] = useState<Course[]>(() =>
    mergeClasses(loadClasses(), initialAssignments)
  );
  const [classForm, setClassForm] = useState({
    name: "",
    meetingDays: [] as string[],
    meetingStartTime: "",
    meetingEndTime: ""
  });
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingClassName, setEditingClassName] = useState("");
  const [editingClassDays, setEditingClassDays] = useState<string[]>([]);
  const [editingClassStartTime, setEditingClassStartTime] = useState("");
  const [editingClassEndTime, setEditingClassEndTime] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<
    "overview" | "assignments" | "calendar" | "classes"
  >("overview");
  const [events, setEvents] = useState<CalendarEvent[]>(loadEvents);
  const [eventForm, setEventForm] = useState({
    title: "",
    date: "",
    time: "",
    courseId: "",
    notes: ""
  });
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => toISODate(new Date()));
  const [calendarView, setCalendarView] = useState<"day" | "month">("day");
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const quickAddRef = useRef<HTMLDivElement | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddPosition, setQuickAddPosition] = useState(0);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<SchoolOverride[]>(loadOverrides);
  const [noSchoolForm, setNoSchoolForm] = useState({
    startDate: "",
    endDate: "",
    label: ""
  });
  const [specialDayForm, setSpecialDayForm] = useState({ date: "", dayOfWeek: "Mon" });
  const [showSplash, setShowSplash] = useState(true);
  const [splashHiding, setSplashHiding] = useState(false);
  const [dailyQuote, setDailyQuote] = useState("");
  const [now, setNow] = useState(() => new Date());
  const pageRefs = useRef<{
    overview: HTMLDivElement | null;
    assignments: HTMLDivElement | null;
    calendar: HTMLDivElement | null;
    classes: HTMLDivElement | null;
  }>({ overview: null, assignments: null, calendar: null, classes: null });
  const scrollPositions = useRef<
    Record<"overview" | "assignments" | "calendar" | "classes", number>
  >({
    overview: 0,
    assignments: 0,
    calendar: 0,
    classes: 0
  });
  const previousPage = useRef<typeof activePage>(activePage);

  const stats = useMemo(() => {
    const total = assignments.length;
    const open = assignments.filter((item) => item.status === "Open").length;
    const done = assignments.filter((item) => item.status === "Done").length;
    const overdue = assignments.filter(isOverdue).length;
    const dueSoon = assignments.filter((item) => isDueSoon(item)).length;
    return { total, open, done, overdue, dueSoon };
  }, [assignments]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const visible = assignments.filter((item) => {
      if (filter === "open" && item.status !== "Open") return false;
      if (filter === "done" && item.status !== "Done") return false;
      if (selectedCourse && item.course !== selectedCourse) return false;
      if (!normalizedQuery) return true;
      return (
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.course.toLowerCase().includes(normalizedQuery) ||
        item.notes.toLowerCase().includes(normalizedQuery)
      );
    });

    const sorted = [...visible].sort((a, b) => {
      if (sortKey === "due") return parseDate(a.dueDate) - parseDate(b.dueDate);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return sorted;
  }, [assignments, filter, query, sortKey, selectedCourse]);

  const courseCounts = useMemo(() => {
    const map = new Map<string, { total: number; open: number }>();
    assignments.forEach((item) => {
      const entry = map.get(item.course) ?? { total: 0, open: 0 };
      entry.total += 1;
      if (item.status === "Open") entry.open += 1;
      map.set(item.course, entry);
    });
    return map;
  }, [assignments]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.course.trim() || !form.dueDate || !form.dueTime) return;

    if (editingId) {
      const updated = assignments.map((item) =>
        item.id === editingId
          ? {
              ...item,
              ...form,
              title: form.title.trim(),
              course: form.course.trim()
            }
          : item
      );
      setAssignments(updated);
      persistAssignments(updated);
      setEditingId(null);
      setForm(emptyForm);
      return;
    }

    const next: Assignment = {
      id: crypto.randomUUID(),
      title: form.title.trim(),
      course: form.course.trim(),
      dueDate: form.dueDate,
      dueTime: form.dueTime,
      status: "Open",
      notes: form.notes.trim(),
      createdAt: new Date().toISOString()
    };

    const updated = [next, ...assignments];
    setAssignments(updated);
    persistAssignments(updated);
    setForm(emptyForm);
  };

  const handleCreateClass = (event: React.FormEvent) => {
    event.preventDefault();
    const name = classForm.name.trim();
    if (!name) return;
    const exists = classes.some((item) => item.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      setClassForm((prev) => ({ ...prev, name: "" }));
      return;
    }
    const updated = [
      ...classes,
      {
        id: crypto.randomUUID(),
        name,
        meetingDays: classForm.meetingDays,
        meetingStartTime: classForm.meetingStartTime,
        meetingEndTime: classForm.meetingEndTime
      }
    ].sort((a, b) => a.name.localeCompare(b.name));
    setClasses(updated);
    persistClasses(updated);
    setClassForm({ name: "", meetingDays: [], meetingStartTime: "", meetingEndTime: "" });
  };

  const handleDeleteClass = (course: Course) => {
    const counts = courseCounts.get(course.name);
    if (counts && counts.total > 0) return;
    const updated = classes.filter((item) => item.id !== course.id);
    setClasses(updated);
    persistClasses(updated);
    if (selectedCourse === course.name) setSelectedCourse(null);
    if (form.course === course.name) setForm({ ...form, course: "" });
  };

  const handleStartEditClass = (course: Course) => {
    setEditingClassId(course.id);
    setEditingClassName(course.name);
    setEditingClassDays(course.meetingDays ?? []);
    setEditingClassStartTime(course.meetingStartTime ?? "");
    setEditingClassEndTime(course.meetingEndTime ?? "");
  };

  const handleCancelEditClass = () => {
    setEditingClassId(null);
    setEditingClassName("");
    setEditingClassDays([]);
    setEditingClassStartTime("");
    setEditingClassEndTime("");
  };

  const handleSaveEditClass = (course: Course) => {
    const name = editingClassName.trim();
    if (!name) return;
    const exists = classes.some(
      (item) => item.id !== course.id && item.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) return;
    const updated = classes
      .map((item) =>
        item.id === course.id
          ? {
              ...item,
              name,
              meetingDays: editingClassDays,
              meetingStartTime: editingClassStartTime,
              meetingEndTime: editingClassEndTime
            }
          : item
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    setClasses(updated);
    persistClasses(updated);
    setAssignments((prev) => {
      const next = prev.map((assignment) =>
        assignment.course === course.name ? { ...assignment, course: name } : assignment
      );
      persistAssignments(next);
      return next;
    });
    if (selectedCourse === course.name) setSelectedCourse(name);
    if (form.course === course.name) setForm({ ...form, course: name });
    setEditingClassId(null);
    setEditingClassName("");
    setEditingClassDays([]);
    setEditingClassStartTime("");
    setEditingClassEndTime("");
  };

  const handleToggleStatus = (id: string) => {
    const updated = assignments.map((item) =>
      item.id === id
        ? {
            ...item,
            status: item.status === "Open" ? ("Done" as Status) : ("Open" as Status),
            completedAt: item.status === "Open" ? new Date().toISOString() : undefined
          }
        : item
    );
    setAssignments(updated);
    persistAssignments(updated);
  };

  const handleDelete = (id: string) => {
    const updated = assignments.filter((item) => item.id !== id);
    setAssignments(updated);
    persistAssignments(updated);
    if (editingId === id) {
      setEditingId(null);
      setForm(emptyForm);
    }
  };

  const handleEdit = (assignment: Assignment) => {
    setEditingId(assignment.id);
    setForm({
      title: assignment.title,
      course: assignment.course,
      dueDate: assignment.dueDate,
      dueTime: assignment.dueTime,
      notes: assignment.notes
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleToggleClassDay = (day: string) => {
    setEditingClassDays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day]
    );
  };

  const handleToggleCreateDay = (day: string) => {
    setClassForm((prev) => ({
      ...prev,
      meetingDays: prev.meetingDays.includes(day)
        ? prev.meetingDays.filter((item) => item !== day)
        : [...prev.meetingDays, day]
    }));
  };

  const handleCreateEvent = (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventForm.title.trim() || !eventForm.date) return;
    const next: CalendarEvent = {
      id: crypto.randomUUID(),
      title: eventForm.title.trim(),
      date: eventForm.date,
      time: eventForm.time,
      courseId: eventForm.courseId,
      notes: eventForm.notes.trim(),
      createdAt: new Date().toISOString()
    };
    const updated = [next, ...events];
    setEvents(updated);
    persistEvents(updated);
    setEventForm({ title: "", date: "", time: "", courseId: "", notes: "" });
    setSelectedDate(next.date);
  };

  const handleDeleteEvent = (id: string) => {
    const updated = events.filter((item) => item.id !== id);
    setEvents(updated);
    persistEvents(updated);
  };

  const calendarDays = useMemo(() => {
    const start = monthStart(calendarMonth);
    const end = monthEnd(calendarMonth);
    const days: Date[] = [];
    const leading = dayIndex(start);
    for (let i = 0; i < leading; i += 1) {
      days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() - (leading - i)));
    }
    for (let day = 1; day <= end.getDate(); day += 1) {
      days.push(new Date(start.getFullYear(), start.getMonth(), day));
    }
    const trailing = 7 - (days.length % 7 || 7);
    for (let i = 1; i <= trailing; i += 1) {
      days.push(new Date(end.getFullYear(), end.getMonth(), end.getDate() + i));
    }
    return days;
  }, [calendarMonth]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((item) => {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    });
    map.forEach((list) =>
      list.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"))
    );
    return map;
  }, [events]);

  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  const selectedDateObj = useMemo(() => {
    const [year, month, day] = selectedDate.split("-").map(Number);
    return new Date(year, month - 1, day);
  }, [selectedDate]);
  const dayHours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  const classById = useMemo(() => {
    const map = new Map<string, Course>();
    classes.forEach((item) => map.set(item.id, item));
    return map;
  }, [classes]);

  const overrideByDate = useMemo(() => {
    const map = new Map<string, SchoolOverride>();
    overrides.forEach((item) => map.set(item.date, item));
    return map;
  }, [overrides]);

  const scheduleDayForDate = (date: Date) => {
    const iso = toISODate(date);
    const override = overrideByDate.get(iso);
    if (override?.kind === "no_school") return null;
    if (override?.kind === "day_schedule" && override.dayOfWeek) return override.dayOfWeek;
    return DAYS[dayIndex(date)];
  };

  const todayISO = useMemo(() => toISODate(now), [now]);
  const tomorrowISO = useMemo(() => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return toISODate(date);
  }, [now]);

  const assignmentsDueToday = useMemo(
    () => assignments.filter((item) => item.dueDate === todayISO),
    [assignments, todayISO]
  );

  const assignmentsDueTomorrow = useMemo(
    () => assignments.filter((item) => item.dueDate === tomorrowISO),
    [assignments, tomorrowISO]
  );

  const nextClassToday = useMemo(() => {
    const weekday = scheduleDayForDate(now);
    if (!weekday) return null;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const candidates = classes
      .filter(
        (course) =>
          course.meetingDays.includes(weekday) && Boolean(course.meetingStartTime)
      )
      .map((course) => ({
        course,
        start: timeToMinutes(course.meetingStartTime),
        end: timeToMinutes(course.meetingEndTime)
      }))
      .filter((item) => item.start !== null && item.start >= currentMinutes)
      .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    return candidates[0] ?? null;
  }, [classes, now, overrideByDate]);

  useEffect(() => {
    const prev = previousPage.current;
    const prevEl = pageRefs.current[prev];
    if (prevEl) {
      scrollPositions.current[prev] = prevEl.scrollTop;
    }
    const nextEl = pageRefs.current[activePage];
    if (nextEl) {
      nextEl.scrollTop = scrollPositions.current[activePage] ?? 0;
    }
    previousPage.current = activePage;
  }, [activePage]);

  useEffect(() => {
    const quotes = [
      "Small steps add up to big wins.",
      "Future you will thank you for today.",
      "Focus on progress, not perfection.",
      "Consistency beats intensity.",
      "You’re closer than you think."
    ];
    setDailyQuote(quotes[Math.floor(Math.random() * quotes.length)]);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const handleDismissSplash = () => {
    setSplashHiding(true);
    setTimeout(() => setShowSplash(false), 420);
  };

  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    if (quickAddRef.current && quickAddRef.current.contains(event.target as Node)) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const minutes = Math.round(y / 5) * 5;
    const time = minutesToTime(minutes);
    setEventForm((prev) => ({ ...prev, date: selectedDate, time }));
    setQuickAddPosition(Math.max(0, Math.min(rect.height - 140, y)));
    setQuickAddOpen(true);
  };

  const handleQuickAddSubmit = (event: React.FormEvent) => {
    handleCreateEvent(event);
    setQuickAddOpen(false);
  };

  const handleQuickAddCancel = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setEditingEventId(null);
    setQuickAddOpen(false);
  };

  const handleEditEventSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingEventId) return;
    if (!eventForm.title.trim() || !eventForm.date) return;
    const updated = events.map((item) =>
      item.id === editingEventId
        ? {
            ...item,
            title: eventForm.title.trim(),
            date: eventForm.date,
            time: eventForm.time,
            courseId: eventForm.courseId,
            notes: eventForm.notes.trim()
          }
        : item
    );
    setEvents(updated);
    persistEvents(updated);
    setEditingEventId(null);
    setQuickAddOpen(false);
  };

  const handleDeleteEditingEvent = () => {
    if (!editingEventId) return;
    handleDeleteEvent(editingEventId);
    setEditingEventId(null);
    setQuickAddOpen(false);
  };

  const handleAddNoSchool = (event: React.FormEvent) => {
    event.preventDefault();
    if (!noSchoolForm.startDate) return;
    // Parse as local dates to avoid UTC date-shift (e.g. showing previous day).
    const start = parseLocalDate(noSchoolForm.startDate);
    const end = parseLocalDate(noSchoolForm.endDate || noSchoolForm.startDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    const rangeStart = start <= end ? start : end;
    const rangeEnd = start <= end ? end : start;
    const nextOverrides: SchoolOverride[] = [];
    for (
      let day = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
      day <= rangeEnd;
      day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
    ) {
      nextOverrides.push({
        id: crypto.randomUUID(),
        date: toISODate(day),
        kind: "no_school",
        label: noSchoolForm.label.trim()
      });
    }
    const updated = [...nextOverrides, ...overrides];
    setOverrides(updated);
    persistOverrides(updated);
    setNoSchoolForm({ startDate: "", endDate: "", label: "" });
  };

  const handleAddSpecialDay = (event: React.FormEvent) => {
    event.preventDefault();
    if (!specialDayForm.date || !specialDayForm.dayOfWeek) return;
    const next: SchoolOverride = {
      id: crypto.randomUUID(),
      date: specialDayForm.date,
      kind: "day_schedule",
      dayOfWeek: specialDayForm.dayOfWeek
    };
    const updated = [next, ...overrides];
    setOverrides(updated);
    persistOverrides(updated);
    setSpecialDayForm({ date: "", dayOfWeek: "Mon" });
  };

  const handleDeleteOverride = (id: string) => {
    const updated = overrides.filter((item) => item.id !== id);
    setOverrides(updated);
    persistOverrides(updated);
  };

  return (
    <div className="app">
      {showSplash ? (
        <div
          className={`splash ${splashHiding ? "hide" : ""}`}
          onClick={handleDismissSplash}
        >
          <div className="splash-card">
            <span className="splash-greeting">Hi Farhan</span>
            <h1 className="splash-date">
              {new Date().toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric"
              })}
            </h1>
            <p className="splash-app">Assignment Tracker</p>
            <p className="splash-quote">“{dailyQuote}”</p>
            <span className="splash-hint">Tap to continue</span>
          </div>
        </div>
      ) : null}
      <header className="hero">
        <div>
          <p className="eyebrow">Assignment Tracker</p>
          <div className="page-toggle">
            <button
              className={`ghost ${activePage === "overview" ? "active" : ""}`}
              type="button"
              onClick={() => setActivePage("overview")}
            >
              Overview
            </button>
            <button
              className={`ghost ${activePage === "assignments" ? "active" : ""}`}
              type="button"
              onClick={() => setActivePage("assignments")}
            >
              Assignments
            </button>
            <button
              className={`ghost ${activePage === "classes" ? "active" : ""}`}
              type="button"
              onClick={() => setActivePage("classes")}
            >
              Classes
            </button>
            <button
              className={`ghost ${activePage === "calendar" ? "active" : ""}`}
              type="button"
              onClick={() => setActivePage("calendar")}
            >
              Calendar
            </button>
          </div>
        </div>
      </header>

      <main className={`layout page-${activePage}`}>
        <div
          className={`page-panel page-overview ${activePage === "overview" ? "active" : ""}`}
          ref={(node) => {
            pageRefs.current.overview = node;
          }}
        >
          <section className="card overview-page">
            <div className="card-header">
              <div className="title-stack">
                <h2>Overview</h2>
                <p className="muted">Your day at a glance.</p>
              </div>
            </div>
            <div className="overview-grid">
              <div className="overview-card">
                <p className="muted">Current time</p>
                <h3>
                  {now.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit"
                  })}
                </h3>
                <p className="overview-subtle">
                  {now.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                  })}
                </p>
              </div>
              <div className="overview-card">
                <p className="muted">Next class</p>
                {nextClassToday ? (
                  <>
                    <h3>{nextClassToday.course.name}</h3>
                    <p className="overview-subtle">
                      {formatTimeRange(
                        nextClassToday.course.meetingStartTime,
                        nextClassToday.course.meetingEndTime
                      )}
                    </p>
                  </>
                ) : (
                  <h3>You are done for the day</h3>
                )}
              </div>
            </div>
            <div className="overview-grid">
              <div className="overview-card">
                <p className="muted">Due today</p>
                {assignmentsDueToday.length === 0 ? (
                  <p className="overview-subtle">Nothing due today.</p>
                ) : (
                  <ul className="overview-list">
                    {assignmentsDueToday.map((item) => (
                      <li key={item.id}>
                        <strong>{item.title}</strong>
                        <span>{item.course}</span>
                        <span>{formatDueDateTime(item)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="overview-card">
                <p className="muted">Due tomorrow</p>
                {assignmentsDueTomorrow.length === 0 ? (
                  <p className="overview-subtle">Nothing due tomorrow.</p>
                ) : (
                  <ul className="overview-list">
                    {assignmentsDueTomorrow.map((item) => (
                      <li key={item.id}>
                        <strong>{item.title}</strong>
                        <span>{item.course}</span>
                        <span>{formatDueDateTime(item)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>
  <div
    className={`page-panel page-classes ${activePage === "classes" ? "active" : ""}`}
    ref={(node) => {
      pageRefs.current.classes = node;
    }}
  >
    <section className="card classes-page">
      <div className="card-header">
        <div className="title-stack">
          <h2>Classes</h2>
          <p className="muted">Add classes, meeting days, and times.</p>
        </div>
      </div>
      <div className="classes-grid">
        <div className="classes-panel">
          <h3>Add Class</h3>
          <form className="class-form" onSubmit={handleCreateClass}>
            <label>
              Class name
              <input
                value={classForm.name}
                onChange={(event) =>
                  setClassForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="CS 221"
                required
              />
            </label>
            <div className="day-picker">
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={`day-chip ${classForm.meetingDays.includes(day) ? "active" : ""}`}
                  onClick={() => handleToggleCreateDay(day)}
                >
                  {day}
                </button>
              ))}
            </div>
            <label>
              Start time
              <input
                type="time"
                value={classForm.meetingStartTime}
                onChange={(event) =>
                  setClassForm((prev) => ({
                    ...prev,
                    meetingStartTime: event.target.value
                  }))
                }
              />
            </label>
            <label>
              End time
              <input
                type="time"
                value={classForm.meetingEndTime}
                onChange={(event) =>
                  setClassForm((prev) => ({
                    ...prev,
                    meetingEndTime: event.target.value
                  }))
                }
              />
            </label>
            <button className="primary" type="submit">
              Add Class
            </button>
          </form>
        </div>
        <div className="classes-panel">
          <h3>Your Classes</h3>
          {classes.length === 0 ? (
            <p className="muted">No classes yet.</p>
          ) : (
            <ul className="classes-list">
              {classes.map((course) => (
                <li key={course.id}>
                  {editingClassId === course.id ? (
                    <div className="class-edit">
                      <input
                        value={editingClassName}
                        onChange={(event) => setEditingClassName(event.target.value)}
                        placeholder="Class name"
                      />
                      <div className="day-picker">
                        {DAYS.map((day) => (
                          <button
                            key={day}
                            type="button"
                            className={`day-chip ${
                              editingClassDays.includes(day) ? "active" : ""
                            }`}
                            onClick={() => handleToggleClassDay(day)}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                      <label>
                        Start time
                        <input
                          type="time"
                          value={editingClassStartTime}
                          onChange={(event) => setEditingClassStartTime(event.target.value)}
                        />
                      </label>
                      <label>
                        End time
                        <input
                          type="time"
                          value={editingClassEndTime}
                          onChange={(event) => setEditingClassEndTime(event.target.value)}
                        />
                      </label>
                      <div className="class-actions">
                        <button className="ghost tiny" type="button" onClick={() => handleSaveEditClass(course)}>
                          Save
                        </button>
                        <button className="ghost tiny" type="button" onClick={handleCancelEditClass}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="class-details">
                        <strong>{course.name}</strong>
                        <div className="muted">
                          {course.meetingDays.length > 0
                            ? sortDays(course.meetingDays).join(", ")
                            : "No days set"}
                        </div>
                        <div className="muted">
                          {formatTimeRange(course.meetingStartTime, course.meetingEndTime) ||
                            "No time set"}
                        </div>
                      </div>
                      <div className="class-actions">
                        <button className="ghost tiny" type="button" onClick={() => handleStartEditClass(course)}>
                          Edit
                        </button>
                        <button
                          className="ghost tiny"
                          type="button"
                          onClick={() => handleDeleteClass(course)}
                          disabled={(courseCounts.get(course.name)?.total ?? 0) > 0}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="classes-panel">
          <h3>No School Days</h3>
          <form className="class-form" onSubmit={handleAddNoSchool}>
            <label>
              Start date
              <input
                type="date"
                value={noSchoolForm.startDate}
                onChange={(event) =>
                  setNoSchoolForm((prev) => ({ ...prev, startDate: event.target.value }))
                }
                required
              />
            </label>
            <label>
              End date (optional)
              <input
                type="date"
                value={noSchoolForm.endDate}
                onChange={(event) =>
                  setNoSchoolForm((prev) => ({ ...prev, endDate: event.target.value }))
                }
              />
            </label>
            <label>
              Label (optional)
              <input
                value={noSchoolForm.label}
                onChange={(event) =>
                  setNoSchoolForm((prev) => ({ ...prev, label: event.target.value }))
                }
                placeholder="Spring break"
              />
            </label>
            <button className="primary" type="submit">
              Add No-School Day
            </button>
          </form>
          {overrides.filter((item) => item.kind === "no_school").length === 0 ? (
            <p className="muted">No no-school days yet.</p>
          ) : (
            <ul className="classes-list">
              {overrides
                .filter((item) => item.kind === "no_school")
                .map((item) => (
                  <li key={item.id}>
                    <div className="class-details">
                      <strong>{formatDate(item.date)}</strong>
                      <div className="muted">{item.label || "No school"}</div>
                    </div>
                    <div className="class-actions">
                      <button
                        className="ghost tiny"
                        type="button"
                        onClick={() => handleDeleteOverride(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
        <div className="classes-panel">
          <h3>Special Schedule Days</h3>
          <form className="class-form" onSubmit={handleAddSpecialDay}>
            <label>
              Date
              <input
                type="date"
                value={specialDayForm.date}
                onChange={(event) =>
                  setSpecialDayForm((prev) => ({ ...prev, date: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Follow day
              <select
                value={specialDayForm.dayOfWeek}
                onChange={(event) =>
                  setSpecialDayForm((prev) => ({ ...prev, dayOfWeek: event.target.value }))
                }
              >
                {DAYS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" type="submit">
              Add Special Day
            </button>
          </form>
          {overrides.filter((item) => item.kind === "day_schedule").length === 0 ? (
            <p className="muted">No special schedule days yet.</p>
          ) : (
            <ul className="classes-list">
              {overrides
                .filter((item) => item.kind === "day_schedule")
                .map((item) => (
                  <li key={item.id}>
                    <div className="class-details">
                      <strong>{formatDate(item.date)}</strong>
                      <div className="muted">Follows {item.dayOfWeek} schedule</div>
                    </div>
                    <div className="class-actions">
                      <button
                        className="ghost tiny"
                        type="button"
                        onClick={() => handleDeleteOverride(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  </div>

  <div
    className={`page-panel page-calendar ${activePage === "calendar" ? "active" : ""}`}
    ref={(node) => {
      pageRefs.current.calendar = node;
    }}
  >
    <section className="card calendar-card">
      <div className="card-header">
        <div className="title-stack">
          <h2>Calendar</h2>
          <p className="muted">
            {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="calendar-controls">
          <div className="tab-row">
            <button
              className={`tab ${calendarView === "day" ? "active" : ""}`}
              type="button"
              onClick={() => setCalendarView("day")}
            >
              Day
            </button>
            <button
              className={`tab ${calendarView === "month" ? "active" : ""}`}
              type="button"
              onClick={() => setCalendarView("month")}
            >
              Month
            </button>
          </div>
          {calendarView === "month" ? (
            <>
              <button
                className="ghost tiny"
                type="button"
                onClick={() =>
                  setCalendarMonth(
                    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                  )
                }
              >
                Prev
              </button>
              <button
                className="ghost tiny"
                type="button"
                onClick={() => setCalendarMonth(new Date())}
              >
                Today
              </button>
              <button
                className="ghost tiny"
                type="button"
                onClick={() =>
                  setCalendarMonth(
                    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                  )
                }
              >
                Next
              </button>
            </>
          ) : null}
        </div>
      </div>

      {calendarView === "month" ? (
        <div className="month-view">
          <div className="calendar-grid">
            {DAYS.map((day) => (
              <div key={day} className="calendar-head">
                {day}
              </div>
            ))}
            {calendarDays.map((date) => {
              const iso = toISODate(date);
              const inMonth = date.getMonth() === calendarMonth.getMonth();
              const dayEvents = eventsByDate.get(iso) ?? [];
              const dayLabel = date.getDate();
              const weekday = scheduleDayForDate(date);
              const recurring = classes.filter(
                (course) =>
                  weekday &&
                  course.meetingDays.includes(weekday) &&
                  (course.meetingStartTime || course.meetingEndTime)
              );
              return (
                <button
                  key={iso}
                  className={`calendar-day ${inMonth ? "" : "muted"} ${
                    iso === selectedDate ? "active" : ""
                  }`}
                  type="button"
                  onClick={() => {
                    setSelectedDate(iso);
                    setCalendarView("day");
                  }}
                >
                  <div className="calendar-day-top">
                    <span>{dayLabel}</span>
                    {dayEvents.length > 0 ? (
                      <span className="calendar-count">{dayEvents.length}</span>
                    ) : null}
                  </div>
                  <div className="calendar-items">
                    {recurring.slice(0, 1).map((course) => (
                      <span key={course.id} className="calendar-pill">
                        {course.name} {formatTimeRange(course.meetingStartTime, course.meetingEndTime)}
                      </span>
                    ))}
                    {dayEvents.slice(0, 1).map((event) => (
                      <span key={event.id} className="calendar-pill accent">
                        {event.title}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="day-grid">
          <div className="day-header">
            <h3>
              {selectedDateObj.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric"
              })}
            </h3>
            <div className="day-nav">
              <button className="ghost tiny" type="button" onClick={() => setCalendarView("month")}>
                Back to Month
              </button>
              <button
                className="ghost tiny"
                type="button"
                onClick={() =>
                  setSelectedDate(
                    toISODate(
                      new Date(
                        selectedDateObj.getFullYear(),
                        selectedDateObj.getMonth(),
                        selectedDateObj.getDate() - 1
                      )
                    )
                  )
                }
              >
                Previous day
              </button>
              <button
                className="ghost tiny"
                type="button"
                onClick={() => setSelectedDate(toISODate(new Date()))}
              >
                Today
              </button>
              <button
                className="ghost tiny"
                type="button"
                onClick={() =>
                  setSelectedDate(
                    toISODate(
                      new Date(
                        selectedDateObj.getFullYear(),
                        selectedDateObj.getMonth(),
                        selectedDateObj.getDate() + 1
                      )
                    )
                  )
                }
              >
                Next day
              </button>
            </div>
          </div>
          <div className="day-list">
            {(() => {
              const weekday = scheduleDayForDate(selectedDateObj);
              const recurring = classes.filter(
                (course) =>
                  weekday &&
                  course.meetingDays.includes(weekday) &&
                  (course.meetingStartTime || course.meetingEndTime)
              );
              const eventsToday = eventsByDate.get(selectedDate) ?? [];
              const timedItems = [
                ...recurring.map((course) => {
                  const start = timeToMinutes(course.meetingStartTime);
                  const end = timeToMinutes(course.meetingEndTime);
                  return {
                    id: `class-${course.id}`,
                    title: course.name,
                    type: "class" as const,
                    start,
                    end: end ?? (start !== null ? start + 60 : null)
                  };
                }),
                ...eventsToday.map((event) => {
                  const start = timeToMinutes(event.time);
                  return {
                    id: `event-${event.id}`,
                    eventId: event.id,
                    title: event.title,
                    type: "event" as const,
                    start,
                    end: start !== null ? start + 60 : null,
                    timeValue: event.time,
                    courseId: event.courseId,
                    notes: event.notes
                  };
                })
              ].filter((item) => item.start !== null);

              const allDayItems = [
                ...recurring
                  .filter((course) => !course.meetingStartTime && !course.meetingEndTime)
                  .map((course) => ({
                    id: `class-all-${course.id}`,
                    label: course.name,
                    type: "class" as const
                  })),
                ...eventsToday.filter((event) => !event.time).map((event) => ({
                  id: `event-all-${event.id}`,
                  label: event.title,
                  type: "event" as const
                }))
              ];

              const now = new Date();
              const isToday =
                now.getFullYear() === selectedDateObj.getFullYear() &&
                now.getMonth() === selectedDateObj.getMonth() &&
                now.getDate() === selectedDateObj.getDate();
              const nowMinutes = now.getHours() * 60 + now.getMinutes();

              return (
                <>
                  <div className="all-day">
                    <span className="all-day-label">All-day</span>
                    {allDayItems.length === 0 ? (
                      <span className="muted">No all-day items</span>
                    ) : (
                      <div className="all-day-items">
                        {allDayItems.map((item) => (
                          <span
                            key={item.id}
                            className={`calendar-pill ${item.type === "event" ? "accent" : ""}`}
                          >
                            {item.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="timeline">
                    <div className="timeline-hours">
                      {dayHours.map((hour) => (
                        <div key={hour} className="timeline-hour">
                          <span>
                            {new Date(0, 0, 0, hour).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit"
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div
                      className="timeline-grid"
                      ref={timelineRef}
                      onClick={handleTimelineClick}
                    >
                      {dayHours.map((hour) => (
                        <div key={hour} className="timeline-row" />
                      ))}
                      {timedItems.map((item) => {
                        const top = (item.start ?? 0) * 1;
                        const height = Math.max(
                          30,
                          ((item.end ?? (item.start ?? 0) + 60) - (item.start ?? 0)) * 1
                        );
                        return (
                          <div
                            key={item.id}
                            className={`timeline-item ${item.type === "event" ? "accent" : ""}`}
                            style={{
                              top: `${top}px`,
                              height: `${height}px`
                            }}
                            title={
                              item.type === "event"
                                ? [
                                    item.title,
                                    formatEventDateTime({
                                      id: item.eventId ?? "",
                                      title: item.title,
                                      courseId: item.courseId ?? "",
                                      date: selectedDate,
                                      time: item.timeValue ?? "",
                                      notes: item.notes ?? "",
                                      createdAt: ""
                                    }),
                                    item.notes ? item.notes : ""
                                  ]
                                    .filter(Boolean)
                                    .join("\n")
                                : `${item.title} (${formatTimeRange(
                                    item.start !== null ? minutesToTime(item.start) : "",
                                    item.end !== null ? minutesToTime(item.end) : ""
                                  )})`
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              if (item.type !== "event") return;
                              setEditingEventId(item.eventId);
                              setEventForm((prev) => ({
                                ...prev,
                                title: item.title,
                                date: selectedDate,
                                time: item.timeValue ?? "",
                                courseId: item.courseId ?? "",
                                notes: item.notes ?? ""
                              }));
                              setQuickAddPosition(Math.max(0, Math.min(1440 - 140, top)));
                              setQuickAddOpen(true);
                            }}
                          >
                            <strong>{item.title}</strong>
                            <span>{item.type === "class" ? "Class" : "Event"}</span>
                          </div>
                        );
                      })}
                      {isToday ? (
                        <div className="timeline-now" style={{ top: `${nowMinutes}px` }}>
                          <span />
                        </div>
                      ) : null}
                      {quickAddOpen ? (
                        <div
                          className="quick-add"
                          style={{ top: `${quickAddPosition}px` }}
                          ref={quickAddRef}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <form
                            className="quick-add-form"
                            onSubmit={editingEventId ? handleEditEventSubmit : handleQuickAddSubmit}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              value={eventForm.title}
                              onChange={(event) =>
                                setEventForm((prev) => ({
                                  ...prev,
                                  title: event.target.value
                                }))
                              }
                              placeholder="New event"
                              required
                            />
                            <div className="quick-add-row">
                              <input
                                type="time"
                                value={eventForm.time}
                                onChange={(event) =>
                                  setEventForm((prev) => ({
                                    ...prev,
                                    time: event.target.value
                                  }))
                                }
                              />
                              <select
                                value={eventForm.courseId}
                                onChange={(event) =>
                                  setEventForm((prev) => ({
                                    ...prev,
                                    courseId: event.target.value
                                  }))
                                }
                              >
                                <option value="">No class</option>
                                {classes.map((course) => (
                                  <option key={course.id} value={course.id}>
                                    {course.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="quick-add-actions">
                              <button className="primary" type="submit">
                                {editingEventId ? "Save" : "Add"}
                              </button>
                              {editingEventId ? (
                                <button
                                  className="danger"
                                  type="button"
                                  onClick={handleDeleteEditingEvent}
                                >
                                  Delete
                                </button>
                              ) : null}
                              <button className="ghost" type="button" onClick={handleQuickAddCancel}>
                                Cancel
                              </button>
                            </div>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </section>
  </div>

  <div
    className={`page-panel page-assignments ${activePage === "assignments" ? "active" : ""}`}
    ref={(node) => {
      pageRefs.current.assignments = node;
    }}
  >
    <aside className="sidebar">
      <section className="card form-card">
        <div className="card-header">
          <h2>{editingId ? "Edit Assignment" : "Add Assignment"}</h2>
          {editingId ? (
            <button className="ghost" type="button" onClick={handleCancelEdit}>
              Cancel
            </button>
          ) : null}
        </div>
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Title
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Problem Set 5"
              required
            />
          </label>
          <label>
            Class
            <select
              value={form.course}
              onChange={(event) => setForm({ ...form, course: event.target.value })}
              required
            >
              <option value="">Select a class</option>
              {classes.map((course) => (
                <option key={course.id} value={course.name}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>
          {classes.length === 0 ? (
            <p className="muted">Create a class first to add assignments.</p>
          ) : null}
          <label>
            Due Date
            <input
              type="date"
              value={form.dueDate}
              onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
              required
            />
          </label>
          <label>
            Due Time
            <input
              type="time"
              value={form.dueTime}
              onChange={(event) => setForm({ ...form, dueTime: event.target.value })}
              required
            />
          </label>
          <label className="notes">
            Notes
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Office hours, resources, grading rubric..."
              rows={4}
            />
          </label>
          <button className="primary" type="submit">
            {editingId ? "Save Changes" : "Add Assignment"}
          </button>
        </form>
      </section>

      <section className="card course-card">
        <div className="card-header">
          <h2>Classes</h2>
        </div>
        {classes.length === 0 ? (
          <p className="muted">Create a class to get started.</p>
        ) : (
          <ul className="course-list">
            {classes.map((course) => {
              const counts = courseCounts.get(course.name) ?? { total: 0, open: 0 };
              return (
                <li key={course.id}>
                  <button
                    className={`course-pill ${selectedCourse === course.name ? "active" : ""}`}
                    onClick={() => setSelectedCourse(course.name)}
                  >
                    <span>{course.name}</span>
                    <small>
                      {counts.open} open · {counts.total} total
                    </small>
                  </button>
                  <div className="class-meta">
                    <span>
                      {course.meetingDays.length > 0
                        ? sortDays(course.meetingDays).join(", ")
                        : "No days"}
                    </span>
                    <small>
                      {formatTimeRange(course.meetingStartTime, course.meetingEndTime) || "No time"}
                    </small>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {selectedCourse ? (
          <button className="ghost block" type="button" onClick={() => setSelectedCourse(null)}>
            Clear class filter
          </button>
        ) : null}
      </section>
    </aside>

    <section className="card list-card">
      <div className="card-header">
        <div className="title-stack">
          <h2>Assignments</h2>
          {selectedCourse ? (
            <p className="muted">Filtered to {selectedCourse}</p>
          ) : null}
        </div>
        <div className="controls">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by course or keyword"
          />
          <select value={filter} onChange={(event) => setFilter(event.target.value as any)}>
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="done">Done</option>
          </select>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="due">Sort by due date</option>
            <option value="created">Sort by newest</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <p>No assignments yet.</p>
          <span>Add one to get started.</span>
        </div>
      ) : (
        <div className="list">
          {filtered.map((assignment) => (
            <article
              key={assignment.id}
              className={`assignment ${assignment.status === "Done" ? "done" : ""} ${
                isOverdue(assignment) ? "overdue" : isDueSoon(assignment) ? "soon" : ""
              }`}
            >
              <div>
                <div className="badge-row">
                  <button
                    className="badge course"
                    onClick={() => setSelectedCourse(assignment.course)}
                    title={`Filter to ${assignment.course}`}
                  >
                    {assignment.course}
                  </button>
                  {isOverdue(assignment) ? (
                    <span className="badge alert">
                      Overdue {daysOverdue(assignment)} {daysOverdue(assignment) === 1 ? "day" : "days"}
                    </span>
                  ) : isDueSoon(assignment) ? (
                    <span className="badge warn">Due soon</span>
                  ) : null}
                </div>
                <h3>{assignment.title}</h3>
                {assignment.notes ? <p>{assignment.notes}</p> : null}
              </div>
              <div className="meta">
                <div>
                  <span>Due</span>
                  <strong>{formatDueDateTime(assignment)}</strong>
                </div>
                {assignment.status === "Done" && assignment.completedAt ? (
                  <div>
                    <span>Completed</span>
                    <strong>
                      {new Date(assignment.completedAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit"
                      })}
                    </strong>
                  </div>
                ) : null}
                <div className="actions">
                  <button className="ghost" onClick={() => handleToggleStatus(assignment.id)}>
                    {assignment.status === "Open" ? "Mark done" : "Reopen"}
                  </button>
                  <button className="ghost" onClick={() => handleEdit(assignment)}>
                    Edit
                  </button>
                  <button className="danger" onClick={() => handleDelete(assignment.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  </div>
</main>
    </div>
  );
}
