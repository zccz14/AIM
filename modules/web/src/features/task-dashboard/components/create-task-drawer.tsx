import {
  Alert,
  Button,
  Drawer,
  Group,
  Stack,
  TextInput,
  Textarea,
} from "@mantine/core";
import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";

export const CreateTaskDrawer = ({
  errorMessage,
  isSubmitting,
  onClose,
  onSubmit,
  opened,
}: {
  errorMessage: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: {
    projectPath: string;
    taskSpec: string;
  }) => Promise<unknown> | unknown;
  opened: boolean;
}) => {
  const [projectPath, setProjectPath] = useState("");
  const [taskSpec, setTaskSpec] = useState("");
  const trimmedProjectPath = projectPath.trim();
  const trimmedTaskSpec = taskSpec.trim();

  useEffect(() => {
    if (!opened) {
      setProjectPath("");
      setTaskSpec("");
    }
  }, [opened]);

  return (
    <Drawer
      closeButtonProps={{ "aria-label": "Close", disabled: isSubmitting }}
      closeOnClickOutside={!isSubmitting}
      closeOnEscape={!isSubmitting}
      onClose={onClose}
      opened={opened}
      position="right"
      size="md"
      title="Create Task"
    >
      <Stack gap="md">
        {errorMessage ? (
          <Alert color="red" icon={<AlertCircle size={16} />}>
            {errorMessage}
          </Alert>
        ) : null}
        <Textarea
          autosize
          label="Task Spec"
          minRows={8}
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
          <Button disabled={isSubmitting} onClick={onClose} variant="default">
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
    </Drawer>
  );
};
