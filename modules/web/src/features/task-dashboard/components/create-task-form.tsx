import {
  Alert,
  Button,
  Card,
  Group,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { AlertCircle } from "lucide-react";
import { useState } from "react";

export const CreateTaskForm = ({
  errorMessage,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  errorMessage: string | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    projectPath: string;
    taskSpec: string;
  }) => Promise<unknown> | unknown;
}) => {
  const [projectPath, setProjectPath] = useState("");
  const [taskSpec, setTaskSpec] = useState("");
  const trimmedProjectPath = projectPath.trim();
  const trimmedTaskSpec = taskSpec.trim();

  return (
    <Card maw={720} padding="xl" radius="md" withBorder>
      <Stack gap="md">
        {errorMessage ? (
          <Alert color="red" icon={<AlertCircle size={16} />}>
            {errorMessage}
          </Alert>
        ) : null}
        <Textarea
          autosize
          label="Task Spec"
          minRows={10}
          onChange={(event) => setTaskSpec(event.currentTarget.value)}
          placeholder="Describe the task to create"
          value={taskSpec}
        />
        <TextInput
          label="Project Path"
          onChange={(event) => setProjectPath(event.currentTarget.value)}
          placeholder="/absolute/path/to/repo"
          value={projectPath}
        />
        <Group justify="flex-end">
          <Button disabled={isSubmitting} onClick={onCancel} variant="default">
            Cancel
          </Button>
          <Button
            disabled={!trimmedProjectPath || !trimmedTaskSpec}
            loading={isSubmitting}
            onClick={() =>
              void onSubmit({
                projectPath: trimmedProjectPath,
                taskSpec: trimmedTaskSpec,
              })
            }
          >
            Create Task
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};
