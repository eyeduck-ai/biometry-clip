// Public change-handler excerpts; fixture only, never executed.
function SetControlsForIOL(select, txt_input, non_toric_chk, toric_chk, is_set_input)
{
	if (is_set_input) {
		// To do maybe
	}
	var val = select.val();

	var is_found = false;
	var is_blocked = false;

	var v = false;
	if (('v' + val) in ioltypes) {
		// Found
		v = ioltypes['v' + val];

		is_found = true;

		// Unblock before changes
		non_toric_chk.prop('disabled', false).closest('label').removeClass('disabled');
		toric_chk.prop('disabled', false).closest('label').removeClass('disabled');

		if ((v[3] == 1) || (v[3] == 2)) {
			// Force Toric
			non_toric_chk.prop('checked', false);
			toric_chk.prop('checked', true);
			toric_chk.trigger('click');
		}
		if ((v[3] == 3) || (v[3] == 4)) {
			// Force Non-Toric
			toric_chk.prop('checked', false);
			non_toric_chk.prop('checked', true);
			non_toric_chk.trigger('click');
		}

		if ((v[3] == 2) || (v[3] == 4)) {
			// Block changes
			is_blocked = true;
		}
	}

	if (is_blocked) {
		non_toric_chk.prop('disabled', true).closest('label').addClass('disabled');
		toric_chk.prop('disabled', true).closest('label').addClass('disabled');
	} else {
		// Unblock
		non_toric_chk.prop('disabled', false).closest('label').removeClass('disabled');
		toric_chk.prop('disabled', false).closest('label').removeClass('disabled');
	}
}

jQuery('select.d-block[name="ioltype_1"]').on('change', function()
	{
		var select = jQuery(this);

		var v = select.val();
		if (('v' + v) in ioltypes) {
			var it = ioltypes['v' + v];
			jQuery('[name="aconstant_1"]', form).val(it[1]);
		} else {
			jQuery('[name="aconstant_1"]', form).val('');
		}

		SetControlsForIOL(
			select,
			jQuery('[name="aconstant_1"]', form),
			jQuery('[name="nontoric_1"]', form),
			jQuery('[name="toric_1"]', form),
			false
		);

		var data = GetFormData();
		ShowValidationErrors(data, 'aconstant_1');
	});

jQuery('select.d-block[name="ioltype_2"]').on('change', function()
	{
		var select = jQuery(this);

		var v = select.val();
		if (('v' + v) in ioltypes) {
			var it = ioltypes['v' + v];
			jQuery('[name="aconstant_2"]', form).val(it[1]);
		} else {
			jQuery('[name="aconstant_2"]', form).val('');
		}

		SetControlsForIOL(
			select,
			jQuery('[name="aconstant_2"]', form),
			jQuery('[name="nontoric_2"]', form),
			jQuery('[name="toric_2"]', form),
			false
		);

		var data = GetFormData();
		ShowValidationErrors(data, 'aconstant_2');
	});
