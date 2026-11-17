/** Dispose model sessions before the parent removes the sandbox realm. */
export async function predictWithDisposableModel(create,input,onReady=()=>{}) {
  let instance,failed=false;
  try{instance=await create();onReady();return await instance.predict(input);}
  catch(error){failed=true;throw error;}
  finally{try{await instance?.dispose();}catch(error){if(!failed)throw error;}}
}
