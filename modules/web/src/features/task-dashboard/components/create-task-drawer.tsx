import { Alert, Button, Drawer, Group, Stack, Textarea } from "@mantine/core";
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
  onSubmit: (taskSpec: string) => Promise<unknown> | unknown;
  opened: boolean;
}) => {
  const [taskSpec, setTaskSpec] = useState("");
  const trimmedTaskSpec = taskSpec.trim();

  useEffect(() => {
    if (!opened) {
      setTaskSpec("");
    }
  }, [opened]);

  return (
    <Drawer
      closeButtonProps={{ "aria-label": "Close" }}
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
        <Group justify="flex-end">
          <Button disabled={isSubmitting} onClick={onClose} variant="default">
            Cancel
          </Button>
          <Button
            disabled={!trimmedTaskSpec}
            loading={isSubmitting}
            onClick={() => void onSubmit(trimmedTaskSpec)}
          >
            Create Task
          </Button>
        </Group>
      </Stack>
    </Drawer>
  );
};
