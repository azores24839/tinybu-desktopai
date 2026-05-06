import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { AppHeader } from "../../components/AppHeader";
import { EmptyState } from "../../components/EmptyState";
import type { CaptureItem, TopicItem } from "../../types";
import { normalizeStatus, sourceLabel, suggestedGroups } from "./captureUtils";

type OrganizePageProps = {
  captures: CaptureItem[];
  topics: TopicItem[];
  createTopicFromCaptures: (captureIds: string[], name?: string) => void;
  addCapturesToTopic: (captureIds: string[], topic: TopicItem) => void;
  back: () => void;
};

export function OrganizePage({
  captures,
  topics,
  createTopicFromCaptures,
  addCapturesToTopic,
  back
}: OrganizePageProps) {
  const groups = suggestedGroups(captures);
  const [selectedCaptureIds, setSelectedCaptureIds] = useState<string[]>([]);
  const [selectedGroupName, setSelectedGroupName] = useState(groups[0]?.name ?? "");
  const [topicName, setTopicName] = useState(groups[0]?.name ?? "New Topic");
  const selectedGroup = groups.find((group) => group.name === selectedGroupName) ?? groups[0];
  const unsorted = captures.filter((capture) => !capture.topicId && normalizeStatus(capture.status) !== "archived");

  useEffect(() => {
    if (selectedGroup) {
      setSelectedGroupName(selectedGroup.name);
      setTopicName(selectedGroup.name);
      setSelectedCaptureIds(selectedGroup.captures.map((capture) => capture.id));
    }
  }, [selectedGroup?.name]);

  const toggleCapture = (id: string) => {
    setSelectedCaptureIds((items) => (items.includes(id) ? items.filter((item) => item !== id) : [...items, id]));
  };

  return (
    <section className="page">
      <AppHeader title="Organize" description="Turn loose captures into durable topics.">
        <button className="secondary" onClick={back}>
          <ChevronLeft size={18} /> Inbox
        </button>
        <button className="primary" onClick={() => createTopicFromCaptures(selectedCaptureIds, topicName)}>
          Confirm Topic
        </button>
      </AppHeader>

      <div className="organize-layout">
        <aside className="panel overflow-panel">
          <div className="section-title">Unsorted Captures</div>
          {unsorted.map((capture) => (
            <label key={capture.id} className={selectedCaptureIds.includes(capture.id) ? "select-row selected" : "select-row"}>
              <input type="checkbox" checked={selectedCaptureIds.includes(capture.id)} onChange={() => toggleCapture(capture.id)} />
              <div>
                <strong>{capture.title}</strong>
                <span>{sourceLabel(capture.sourceKind)}</span>
              </div>
            </label>
          ))}
        </aside>

        <main className="panel overflow-panel">
          <div className="section-title">Suggested Topics</div>
          {groups.map((group) => (
            <button
              key={group.name}
              className={selectedGroupName === group.name ? "suggested-topic active" : "suggested-topic"}
              onClick={() => {
                setSelectedGroupName(group.name);
                setTopicName(group.name);
                setSelectedCaptureIds(group.captures.map((capture) => capture.id));
              }}
            >
              <div>
                <h3>{group.name}</h3>
                <p>{group.summary}</p>
              </div>
              <div className="meta-row">
                <span>{group.captures.length} captures</span>
                <span>{group.practiceGoal}</span>
              </div>
            </button>
          ))}
          {!groups.length && <EmptyState title="Nothing to organize" body="Inbox captures with AI topics will show up here." />}
        </main>

        <aside className="panel topic-editor">
          <div className="section-title">Topic Editor</div>
          <label>
            Topic name
            <input value={topicName} onChange={(event) => setTopicName(event.target.value)} />
          </label>
          <div>
            <h3>Included captures</h3>
            <div className="mini-list">
              {selectedCaptureIds.map((id) => (
                <span key={id}>{captures.find((capture) => capture.id === id)?.title ?? id}</span>
              ))}
            </div>
          </div>
          {!!topics.length && (
            <label>
              Merge with another topic
              <select
                onChange={(event) => {
                  const topic = topics.find((item) => item.id === event.target.value);
                  if (topic) addCapturesToTopic(selectedCaptureIds, topic);
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  Choose topic
                </option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="primary" onClick={() => createTopicFromCaptures(selectedCaptureIds, topicName)}>
            Confirm Topic
          </button>
          <button className="secondary" onClick={() => setSelectedCaptureIds([])}>
            Discard suggestion
          </button>
        </aside>
      </div>
    </section>
  );
}
