import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

interface TaskWidgetProps {
  tasks: { id: number; title: string }[];
  pendingCount: number;
  allDone: boolean;
}

export function TaskWidget({ tasks, pendingCount, allDone }: TaskWidgetProps) {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: '#1E293B',
        borderRadius: 16,
        padding: 14,
      }}
      clickAction="OPEN_APP"
    >
      {/* Header */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: 'match_parent',
          marginBottom: 10,
        }}>
        <TextWidget
          text="Today"
          style={{ fontSize: 16, fontWeight: 'bold', color: '#F1F5F9' }}
        />
        <FlexWidget
          style={{
            flexDirection: 'row',
            alignItems: 'center',
          }}>
          <TextWidget
            text={allDone ? '✓ All done' : `${pendingCount} pending`}
            style={{
              fontSize: 12,
              color: allDone ? '#10B981' : '#06B6D4',
              fontWeight: '600',
              marginRight: 10,
            }}
          />
          <FlexWidget
            clickAction="REFRESH"
            style={{
              backgroundColor: '#334155',
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}>
            <TextWidget
              text="↻"
              style={{ fontSize: 14, color: '#94A3B8' }}
            />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>

      {/* Task list or empty state */}
      {allDone ? (
        <FlexWidget
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <TextWidget
            text="All done! Great work today!"
            style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center' }}
          />
        </FlexWidget>
      ) : tasks.length === 0 ? (
        <FlexWidget
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <TextWidget
            text="No tasks yet"
            style={{ fontSize: 13, color: '#94A3B8' }}
          />
        </FlexWidget>
      ) : (
        <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
          {tasks.slice(0, 5).map((task) => (
            <FlexWidget
              key={task.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 6,
              }}>
              <FlexWidget
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: '#06B6D4',
                  marginRight: 8,
                }}
              />
              <TextWidget
                text={task.title}
                style={{
                  fontSize: 13,
                  color: '#CBD5E1',
                }}
                maxLines={1}
              />
            </FlexWidget>
          ))}
          {pendingCount > 5 && (
            <TextWidget
              text={`+${pendingCount - 5} more`}
              style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}
            />
          )}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
