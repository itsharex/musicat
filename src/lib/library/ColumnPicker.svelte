<script lang="ts">
    import { columnOrder } from "../../data/store";
    import Menu from "../menu/Menu.svelte";
    import MenuDivider from "../menu/MenuDivider.svelte";
    import MenuOption from "../menu/MenuOption.svelte";

    export let pos = { x: 0, y: 0 };
    export let showMenu = false;
    export let fields;
    $: columns = fields.map(f => {
        f.show = $columnOrder.includes(f.value);
        return f;
    });
    export let onResetOrder;
    export let isOrderChanged = false;

    function closeMenu() {
        showMenu = false;
    }

    function toggleField(field) {
        const found = fields.find((f) => f.value === field.value);
        found.show = !found.show;
        fields = [...fields];
        $columnOrder = fields.filter(f => f.show).map(f => f.value);
    }
    // Enrichers
</script>

{#if showMenu}
    <Menu {...pos} onClickOutside={closeMenu} fixed>
        <MenuOption text="Columns" isDisabled />
        {#each columns as field}
            <MenuOption
                text={field.name}
                checked={field.show}
                onClick={() => toggleField(field)}
                borderHighlight
            />
        {/each}
        <MenuDivider />
        <MenuOption
            text="Reset order"
            onClick={onResetOrder}
            isDisabled={!isOrderChanged}
        />
    </Menu>
{/if}
