"use client";

import { useState } from "react";

import { RequestChainLinks } from "@/components/document-chain";
import { InstantLink } from "@/components/instant-link";
import { StatusBadge } from "@/components/status-badge";
import { WorkLocation } from "@/components/work-location";
import type { ChainLink } from "@/lib/document-chain";
import { TOPICS, filterByTopic, isTopicId, type StatusId, type TopicId } from "@/lib/domain";
import { requestTitle, type StageId } from "@/lib/request-stage";
import { formatRelative } from "@/lib/format";
import { clientNewPath, clientRequestPath } from "@/lib/paths";

export function ClientRequestList({
  requests,
}: {
  requests: Array<{
    id: string;
    topic: TopicId;
    stage: StageId;
    status: StatusId;
    work_location: string | null;
    last_activity_at: string;
    client_unread: boolean;
    parent?: ChainLink | null;
    child?: ChainLink | null;
  }>;
}) {
  const [topic, setTopic] = useState("");
  if (requests.length === 0) {
    return (
      <div className="mt-6 rounded-3xl border border-dashed border-line bg-card px-5 py-8">
        <p className="text-base leading-7">尚未有任何請求。需要報價、發票或收據時，可以開一項新請求。</p>
        <InstantLink href={clientNewPath} className="mt-4 inline-flex min-h-11 items-center font-semibold text-stamp">
          開新請求
        </InstantLink>
      </div>
    );
  }

  const shown = filterByTopic(requests, topic);

  return (
    <>
      <label className="mt-5 flex flex-col gap-1 text-sm font-semibold">
        事項
        <select
          name="topic"
          value={topic}
          onChange={(event) => {
            const value = event.target.value;
            setTopic(isTopicId(value) ? value : "");
          }}
          className="rounded-xl border border-line bg-white px-3 py-2 font-normal"
        >
          <option value="">全部</option>
          {TOPICS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {shown.length === 0 ? (
        <p className="mt-6 rounded-3xl border border-dashed border-line bg-card px-5 py-8 text-base leading-7">
          未有這個事項的請求。
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {shown.map((request) => (
            <li
              key={request.id}
              className={`rounded-3xl border bg-card px-4 py-4 ${
                request.client_unread ? "border-stamp" : "border-line"
              }`}
            >
              <InstantLink href={clientRequestPath(request.id)} className="block">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{requestTitle(request.topic, request.stage)}</p>
                  <StatusBadge status={request.status} />
                </div>
                <WorkLocation location={request.work_location} />
                <p className="mt-2 text-sm text-muted">{formatRelative(request.last_activity_at)}</p>
                {request.client_unread ? <p className="mt-2 text-sm font-semibold text-stamp">新回覆</p> : null}
              </InstantLink>
              <RequestChainLinks
                parent={request.parent ?? null}
                child={request.child ?? null}
                hrefFor={clientRequestPath}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
