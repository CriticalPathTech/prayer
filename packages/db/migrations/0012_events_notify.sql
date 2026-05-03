-- Up Migration
CREATE OR REPLACE FUNCTION notify_events() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('events', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_notify ON events;
CREATE TRIGGER events_notify
  AFTER INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION notify_events();

-- Down Migration
DROP TRIGGER IF EXISTS events_notify ON events;
DROP FUNCTION IF EXISTS notify_events();
