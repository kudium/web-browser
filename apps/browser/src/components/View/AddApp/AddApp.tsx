import { Heading, Text } from '@radix-ui/themes';
import { Custom } from './tabs/Custom';

// Creation uses the command bar; this window is reserved for editing an app.
export function AddApp() {
  return (
    <div className="utility-page">
      <header className="page-heading">
        <Heading size="6">Edit group</Heading>
        <Text as="p" color="gray">
          Customize this browsing identity, its icon, and grouping.
        </Text>
      </header>
      <Custom />
    </div>
  );
}
