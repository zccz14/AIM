import { Button, Drawer, Group, Stack, Textarea } from "@mantine/core";
import { useState } from "react";

export const CreateTaskDrawer = ({
  onClose,
  onSubmit,
  opened,
}: {
  onClose: () => void;
  onSubmit: (taskSpec: string) => Promise<unknown> | unknown;
  opened: boolean;
}) => {
  const [taskSpec, setTaskSpec] = useState("");
  const trimmedTaskSpec = taskSpec.trim();
  const handleClose = () => {
    setTaskSpec("");
    onClose();
  };

  return (
    <Drawer
      closeButtonProps={{ "aria-label": "Close" }}
      onClose={handleClose}
      opened={opened}
      position="right"
      size="md"
      title="Create Task"
    >
      <Stack gap="md">
        <Textarea
          autosize
          label="Task Spec"
          minRows={8}
          onChange={(event) => setTaskSpec(event.currentTarget.value)}
          placeholder="Describe the task to create"
          value={taskSpec}
        />
        <Group justify="flex-end">
          <Button onClick={handleClose} variant="default">
            Cancel
          </Button>
          <Button
            disabled={!trimmedTaskSpec}
            onClick={() => void onSubmit(trimmedTaskSpec)}
          >
            Create Task
          </Button>
        </Group>
      </Stack>
    </Drawer>
  );
};
